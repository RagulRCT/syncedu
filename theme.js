(function(){var k='edusync-theme',r=document.documentElement;
function set(t){r.setAttribute('data-theme',t);try{localStorage.setItem(k,t)}catch(e){}var b=document.getElementById('theme');if(b)b.textContent=t==='dark'?'☀ Light':'☾ Dark'}
var s;try{s=localStorage.getItem(k)}catch(e){}
r.setAttribute('data-theme',s||'dark');
window.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('theme');
if(!b){b=document.createElement('button');b.id='theme';b.className='theme-fab';document.body.appendChild(b)}
b.onclick=function(){set(r.getAttribute('data-theme')==='dark'?'light':'dark')};set(r.getAttribute('data-theme'))});})();
