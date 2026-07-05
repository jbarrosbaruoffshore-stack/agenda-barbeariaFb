(function(){
  const cfg=window.BARBER_CONFIG;
  const configured=cfg.supabaseUrl&&!cfg.supabaseUrl.startsWith("COLE_");
  const db=configured?supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const state={date:"",time:"",services:[]};
  const demoHours={0:null,1:["09:00","18:00"],2:["09:00","18:00"],3:["09:00","18:00"],4:["09:00","18:00"],5:["09:00","19:00"],6:["09:00","16:00"]};
  const defaultServices=[{id:"corte",name:"Corte",price:40,duration_minutes:30},{id:"barba",name:"Barba",price:30,duration_minutes:30},{id:"combo",name:"Corte + Barba",price:65,duration_minutes:60},{id:"infantil",name:"Corte infantil",price:35,duration_minutes:30}];

  function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function displayDate(value){return new Date(value+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})}
  function mask(v){const d=v.replace(/\D/g,"").slice(0,11);if(d.length<3)return d;if(d.length<7)return `(${d.slice(0,2)}) ${d.slice(2)}`;return `(${d.slice(0,2)}) ${d.slice(2,d.length===11?7:6)}-${d.slice(d.length===11?7:6)}`}
  function notify(text,error=false){$("message").textContent=text;$("message").className="notice"+(error?" error":"")}
  function selectDate(value){state.date=value;state.time="";$("chosenDate").value=displayDate(value);$("chosenTime").value="";document.querySelectorAll(".date-btn").forEach(b=>b.classList.toggle("active",b.dataset.date===value));loadSlots()}
  function selectTime(value){state.time=value;$("chosenTime").value=value;document.querySelectorAll(".slot-btn").forEach(b=>b.classList.toggle("active",b.dataset.time===value))}
  function currency(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}
  async function loadServices(){
    let services;
    if(db){const r=await db.from("services").select("*").eq("active",true).order("sort_order").order("name");services=r.data||[]}
    else services=JSON.parse(localStorage.getItem("fb-demo-services")||"null")||defaultServices;
    state.services=services;$("service").innerHTML=services.length?'<option value="">Escolha um serviço</option>'+services.map(s=>`<option value="${s.name}">${s.name} — ${currency(s.price)}</option>`).join(""):'<option value="">Nenhum serviço disponível</option>'
  }

  async function loadDates(){
    const out=[];const today=new Date();today.setHours(12,0,0,0);let openDays=demoHours,closed=[];
    if(db){
      const [h,c]=await Promise.all([db.from("business_hours").select("*"),db.from("closures").select("closed_date").gte("closed_date",iso(today))]);
      if(h.data)openDays=Object.fromEntries(h.data.map(x=>[x.weekday,x.is_open?[x.open_time,x.close_time]:null]));
      closed=(c.data||[]).map(x=>x.closed_date);
    }
    for(let i=0;i<21;i++){const d=new Date(today);d.setDate(d.getDate()+i);if(openDays[d.getDay()]&&!closed.includes(iso(d)))out.push(iso(d))}
    $("dates").innerHTML=out.map(d=>`<button class="date-btn" data-date="${d}"><strong>${displayDate(d)}</strong><small>Ver horários</small></button>`).join("");
    document.querySelectorAll(".date-btn").forEach(b=>b.onclick=()=>selectDate(b.dataset.date));
  }
  function demoSlots(date){
    const [start,end]=demoHours[new Date(date+"T12:00:00").getDay()]||[];
    if(!start)return[];const result=[];let [h,m]=start.split(":").map(Number);const [eh,em]=end.split(":").map(Number);
    while(h*60+m<eh*60+em){result.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"));m+=30;if(m>=60){h++;m-=60}}
    const busy=JSON.parse(localStorage.getItem("fb-demo-bookings")||"[]").filter(x=>x.date===date&&x.status!=="cancelado").map(x=>x.time);
    return result.filter(t=>!busy.includes(t));
  }
  async function loadSlots(){
    $("slots").innerHTML='<div class="empty">Consultando horários…</div>';
    let slots;
    if(db){const {data,error}=await db.rpc("get_available_slots",{p_date:state.date});if(error){notify("Não foi possível consultar a agenda.",true);slots=[]}else slots=(data||[]).map(x=>x.slot_time)}
    else slots=demoSlots(state.date);
    $("slots").innerHTML=slots.length?slots.map(t=>`<button class="slot-btn" data-time="${t}">${t}</button>`).join(""):'<div class="empty">Não há horários livres neste dia.</div>';
    document.querySelectorAll(".slot-btn").forEach(b=>b.onclick=()=>selectTime(b.dataset.time));
  }
  async function submit(ev){
    ev.preventDefault();if(!state.date||!state.time){notify("Escolha primeiro o dia e o horário.",true);return}
    if($("phone").value.replace(/\D/g,"").length<10){notify("Informe um WhatsApp com DDD.",true);return}
    const payload={p_client_name:$("name").value.trim(),p_phone:$("phone").value.replace(/\D/g,""),p_service:$("service").value,p_date:state.date,p_time:state.time};
    if(db){const {error}=await db.rpc("create_booking",payload);if(error){notify(error.message.includes("indisponível")?error.message:"Não foi possível reservar. Tente novamente.",true);return}}
    else{const list=JSON.parse(localStorage.getItem("fb-demo-bookings")||"[]"),chosen=state.services.find(s=>s.name===payload.p_service);list.push({id:crypto.randomUUID(),client_name:payload.p_client_name,phone:payload.p_phone,service:payload.p_service,service_price:chosen?.price||0,date:payload.p_date,time:payload.p_time,status:"pendente"});localStorage.setItem("fb-demo-bookings",JSON.stringify(list))}
    notify("Solicitação enviada! A barbearia confirmará pelo WhatsApp.");$("bookingForm").reset();state.time="";await loadSlots()
  }
  $("phone").oninput=e=>e.target.value=mask(e.target.value);
  $("bookingForm").onsubmit=submit;loadDates();loadServices();
  if(!configured)notify("Modo de demonstração ativo. Configure o Supabase para compartilhar a agenda entre aparelhos.");
})();
