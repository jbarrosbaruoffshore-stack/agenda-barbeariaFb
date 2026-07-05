(function(){
  const cfg=window.BARBER_CONFIG;
  const configured=cfg.supabaseUrl&&!cfg.supabaseUrl.startsWith("COLE_");
  const db=configured?supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const DAYS=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  let settings={business_name:cfg.businessName,whatsapp:cfg.whatsappNumber,slot_minutes:30};
  let hours=DAYS.map((_,i)=>({weekday:i,is_open:i!==0,open_time:"09:00",close_time:i===6?"16:00":"18:00"}));
  const defaultServices=[{id:"corte",name:"Corte",price:40,duration_minutes:30,active:true,sort_order:1},{id:"barba",name:"Barba",price:30,duration_minutes:30,active:true,sort_order:2},{id:"combo",name:"Corte + Barba",price:65,duration_minutes:60,active:true,sort_order:3},{id:"infantil",name:"Corte infantil",price:35,duration_minutes:30,active:true,sort_order:4}];
  let bookings=[],freeSlots=[],closures=[],services=[];
  const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function login(ev){
    ev.preventDefault();if(!db){
      const bytes=new TextEncoder().encode($("password").value);
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
      if($("email").value.trim().toLowerCase()!==cfg.demoAdminEmail.toLowerCase()||hash!==cfg.demoAdminPasswordHash){
        $("loginMessage").textContent="Login ou senha incorretos.";$("loginMessage").classList.remove("hidden");return
      }
      localStorage.setItem("fb-demo-admin","1");showAdmin();return
    }
    const {error}=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});
    if(error){$("loginMessage").textContent="E-mail ou senha inválidos.";$("loginMessage").classList.remove("hidden");return}
    const {data}=await db.rpc("is_admin");if(!data){await db.auth.signOut();$("loginMessage").textContent="Esta conta não possui permissão de administrador.";$("loginMessage").classList.remove("hidden");return}
    showAdmin()
  }
  async function showAdmin(){
    $("loginView").classList.add("hidden");$("adminView").classList.remove("hidden");$("adminDate").value=today();
    renderHours();await Promise.all([loadSettings(),loadClosures(),loadAgenda(),loadServices()])
  }
  async function loadAgenda(){
    const date=$("adminDate").value;
    if(db){const a=await db.from("appointments").select("*").eq("appointment_date",date).neq("status","cancelado").order("appointment_time");bookings=a.data||[];const f=await db.rpc("get_available_slots",{p_date:date});freeSlots=(f.data||[]).map(x=>x.slot_time)}
    else{bookings=JSON.parse(localStorage.getItem("fb-demo-bookings")||"[]").filter(x=>x.date===date&&x.status!=="cancelado").map(x=>({...x,appointment_date:x.date,appointment_time:x.time}));freeSlots=demoFree(date)}
    renderAgenda()
  }
  function demoFree(date){const row=hours.find(x=>x.weekday===new Date(date+"T12:00:00").getDay());if(!row?.is_open||closures.includes(date))return[];let [h,m]=row.open_time.split(":").map(Number),[eh,em]=row.close_time.split(":").map(Number),out=[];while(h*60+m<eh*60+em){const t=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");if(!bookings.some(x=>(x.appointment_time||x.time).slice(0,5)===t))out.push(t);m+=Number(settings.slot_minutes);if(m>=60){h+=Math.floor(m/60);m%=60}}return out}
  function renderAgenda(){
    $("bookingCount").textContent=bookings.length;$("freeCount").textContent=freeSlots.length;$("dayLabel").textContent=new Date($("adminDate").value+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
    $("appointments").innerHTML=bookings.length?bookings.map(a=>`<article class="appointment"><strong>${escape((a.appointment_time||a.time).slice(0,5))}</strong><div><strong>${escape(a.client_name)}</strong><small>${escape(a.phone||"Sem telefone")}</small></div><div class="service-col"><strong>${escape(a.service)}</strong><small>${a.service_price!=null?currency(a.service_price):"Solicitado pelo site"}</small></div><span class="badge">${escape(a.status)}</span></article>`).join(""):'<div class="empty">Nenhum cliente marcado neste dia.</div>'
  }
  function renderHours(){
    $("hours").innerHTML=hours.map(h=>`<div class="hour-row" data-day="${h.weekday}"><strong>${DAYS[h.weekday]}</strong><label><input type="checkbox" ${h.is_open?"checked":""}> Aberto</label><input type="time" value="${h.open_time.slice(0,5)}"><input type="time" value="${h.close_time.slice(0,5)}"></div>`).join("")
  }
  async function saveHours(){
    hours=[...document.querySelectorAll(".hour-row")].map(r=>({weekday:Number(r.dataset.day),is_open:r.querySelector("input[type=checkbox]").checked,open_time:r.querySelectorAll("input[type=time]")[0].value,close_time:r.querySelectorAll("input[type=time]")[1].value}));
    if(db){const {error}=await db.from("business_hours").upsert(hours);if(error){alert("Não foi possível salvar: "+error.message);return}}
    else localStorage.setItem("fb-demo-hours",JSON.stringify(hours));alert("Horários salvos.")
  }
  async function loadClosures(){if(db){const r=await db.from("closures").select("closed_date").gte("closed_date",today()).order("closed_date");closures=(r.data||[]).map(x=>x.closed_date)}else closures=JSON.parse(localStorage.getItem("fb-demo-closures")||"[]");renderClosures()}
  function renderClosures(){$("closures").innerHTML=closures.map(d=>`<span class="chip">${new Date(d+"T12:00:00").toLocaleDateString("pt-BR")}</span>`).join("")}
  async function addClosure(){const d=$("closureDate").value;if(!d)return;if(db)await db.from("closures").upsert({closed_date:d,reason:"Fechado"});else{closures.push(d);localStorage.setItem("fb-demo-closures",JSON.stringify([...new Set(closures)]))}await loadClosures()}
  async function loadSettings(){if(db){const r=await db.from("business_settings").select("*").eq("id",1).single();if(r.data)settings=r.data}else{settings=JSON.parse(localStorage.getItem("fb-demo-settings")||"null")||settings;hours=JSON.parse(localStorage.getItem("fb-demo-hours")||"null")||hours;renderHours()}$("businessName").value=settings.business_name;$("whatsapp").value=settings.whatsapp;$("slotMinutes").value=settings.slot_minutes}
  function currency(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}
  async function loadServices(){
    if(db){const r=await db.from("services").select("*").order("sort_order").order("name");services=r.data||[]}
    else services=JSON.parse(localStorage.getItem("fb-demo-services")||"null")||defaultServices.map(x=>({...x}));
    renderServices()
  }
  function renderServices(){
    $("serviceList").innerHTML=services.length?services.map(s=>`<article class="service-row"><div><strong>${escape(s.name)}</strong><small>${s.active?"Disponível no site":"Oculto no site"}</small></div><span class="service-price">${currency(s.price)}</span><span class="duration-col">${s.duration_minutes} min</span><div class="service-actions"><button class="small-btn" data-edit-service="${escape(s.id)}">Editar</button><button class="small-btn delete" data-delete-service="${escape(s.id)}">${s.active?"Ocultar":"Reativar"}</button></div></article>`).join(""):'<div class="empty">Nenhum serviço cadastrado.</div>';
    document.querySelectorAll("[data-edit-service]").forEach(b=>b.onclick=()=>openService(b.dataset.editService));
    document.querySelectorAll("[data-delete-service]").forEach(b=>b.onclick=()=>toggleService(b.dataset.deleteService))
  }
  function openService(id){
    const service=services.find(s=>String(s.id)===String(id));$("serviceForm").classList.remove("hidden");$("serviceId").value=service?.id||"";$("serviceName").value=service?.name||"";$("servicePrice").value=service?.price??"";$("serviceDuration").value=String(service?.duration_minutes||30);$("serviceName").focus()
  }
  function closeServiceForm(){$("serviceForm").reset();$("serviceId").value="";$("serviceForm").classList.add("hidden")}
  async function saveService(ev){
    ev.preventDefault();const id=$("serviceId").value;const row={name:$("serviceName").value.trim(),price:Number($("servicePrice").value),duration_minutes:Number($("serviceDuration").value),active:true,sort_order:services.length+1};
    if(db){const result=id?await db.from("services").update(row).eq("id",id):await db.from("services").insert(row);if(result.error){alert("Não foi possível salvar: "+result.error.message);return}}
    else{if(id){const i=services.findIndex(s=>String(s.id)===id);row.id=services[i].id;row.active=services[i].active;row.sort_order=services[i].sort_order;services[i]=row}else services.push({...row,id:crypto.randomUUID()});localStorage.setItem("fb-demo-services",JSON.stringify(services))}
    closeServiceForm();await loadServices()
  }
  async function toggleService(id){
    const service=services.find(s=>String(s.id)===String(id));if(!service)return;const active=!service.active;
    if(db)await db.from("services").update({active}).eq("id",id);else{service.active=active;localStorage.setItem("fb-demo-services",JSON.stringify(services))}
    await loadServices()
  }
  async function saveSettings(ev){ev.preventDefault();settings={id:1,business_name:$("businessName").value.trim(),whatsapp:$("whatsapp").value.replace(/\D/g,""),slot_minutes:Number($("slotMinutes").value)};if(db)await db.from("business_settings").upsert(settings);else localStorage.setItem("fb-demo-settings",JSON.stringify(settings));$("settingsMessage").textContent="Configurações salvas.";$("settingsMessage").classList.remove("hidden")}
  function share(){const date=$("adminDate").value,label=new Date(date+"T12:00:00").toLocaleDateString("pt-BR");let text=`Agenda ${settings.business_name} — ${label}\n\n`;text+=bookings.length?"Marcados:\n"+bookings.map(a=>`${(a.appointment_time||a.time).slice(0,5)} — ${a.client_name} (${a.service})`).join("\n")+"\n\n":"Nenhum cliente marcado.\n\n";text+=freeSlots.length?"Horários livres:\n"+freeSlots.join(" · "):"Sem horários livres.";window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank")}
  function showView(view){const meta={agenda:["Agenda","Horários e clientes marcados."],services:["Serviços","Atualize nomes, valores e duração dos cortes."],hours:["Funcionamento","Defina quando a loja abre."],settings:["Configurações","Dados gerais da barbearia."]};["agenda","services","hours","settings"].forEach(v=>$(v+"Panel").classList.toggle("hidden",v!==view));$("adminTitle").textContent=meta[view][0];$("adminSubtitle").textContent=meta[view][1];document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view))}
  $("loginForm").onsubmit=login;$("adminDate").onchange=loadAgenda;$("shareWhatsapp").onclick=share;$("newService").onclick=()=>openService();$("cancelService").onclick=closeServiceForm;$("serviceForm").onsubmit=saveService;$("saveHours").onclick=saveHours;$("addClosure").onclick=addClosure;$("settingsForm").onsubmit=saveSettings;$("logout").onclick=async()=>{if(db)await db.auth.signOut();else localStorage.removeItem("fb-demo-admin");location.reload()};document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
  (async()=>{if(db){const {data}=await db.auth.getSession();if(data.session){const a=await db.rpc("is_admin");if(a.data)showAdmin()}}else if(localStorage.getItem("fb-demo-admin"))showAdmin()})();
})();
