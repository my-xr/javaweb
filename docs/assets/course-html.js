(function(){
  function initToc(){
    var btn=document.querySelector('.toc-toggle');
    var floatBtn=document.querySelector('.toc-float-toggle');
    function setCollapsed(v){
      document.body.classList.toggle('toc-collapsed', !!v);
      if(btn) btn.textContent = v ? '展开' : '收起';
    }
    if(btn) btn.addEventListener('click', function(){ setCollapsed(!document.body.classList.contains('toc-collapsed')); });
    if(floatBtn) floatBtn.addEventListener('click', function(){ setCollapsed(false); });
  }
  function textLen(cell){ return (cell ? cell.textContent || '' : '').replace(/\s+/g,'').length; }
  function classifyHeader(t){
    t=(t||'').trim();
    if(/^(编号|序号|题号|类型|是否|时长|分值|阶段)$/.test(t)) return 'short';
    if(/^(时间|时段)$/.test(t)) return 'short';
    if(/^(要点|内容|说明|职责|解析|任务|实施建议|教学活动|学习活动|评价方式)$/.test(t)) return 'long';
    return 'normal';
  }
  function initTables(){
    document.querySelectorAll('.article table').forEach(function(table){
      if(table.classList.contains('table-auto-ready')) return;
      var rows=Array.from(table.rows||[]); if(!rows.length) return;
      var cols=rows[0].cells.length; if(!cols) return;
      var heads=Array.from(rows[0].cells).map(function(c){return (c.textContent||'').trim();});
      var widths=[];
      if(cols===3 && /时段|时间/.test(heads[0]||'') && /内容/.test(heads[1]||'') && /时长/.test(heads[2]||'')) widths=[12,76,12];
      else if(cols===3 && /编号|序号/.test(heads[0]||'') && /知识点/.test(heads[1]||'') && /要点/.test(heads[2]||'')) widths=[12,24,64];
      else {
        var scores=[];
        for(var i=0;i<cols;i++){
          var max=0, sum=0;
          rows.forEach(function(r){ var n=textLen(r.cells[i]); max=Math.max(max,n); sum+=Math.min(n,80); });
          var kind=classifyHeader(heads[i]);
          var score=Math.max(max, sum/Math.max(rows.length,1));
          if(kind==='short') score=Math.min(score,12);
          if(kind==='long') score=Math.max(score,42);
          scores.push(score+8);
        }
        var total=scores.reduce(function(a,b){return a+b;},0)||1;
        widths=scores.map(function(s){ return Math.max(8, Math.round(s/total*100)); });
        var diff=100-widths.reduce(function(a,b){return a+b;},0);
        widths[widths.length-1]+=diff;
      }
      table.querySelectorAll('colgroup').forEach(function(old){ old.remove(); });
      var cg=document.createElement('colgroup');
      widths.forEach(function(w,i){
        var col=document.createElement('col');
        col.style.width = w+'%';
        col.style.setProperty('--col-width', w+'%');
        col.className = (w<=14 || classifyHeader(heads[i])==='short') ? 'col-short' : 'col-long';
        cg.appendChild(col);
      });
      table.insertBefore(cg, table.firstChild);
      rows.forEach(function(r){ Array.from(r.cells).forEach(function(c,i){ if(widths[i]<=14) c.classList.add('nowrap-col'); }); });
      table.classList.add('table-auto-ready');
    });
  }
  function run(){ initToc(); initTables(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

