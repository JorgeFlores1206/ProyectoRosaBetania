import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const $ = s => document.querySelector(s);
const CARAS = ["Anverso", "Reverso", "Anverso y reverso"];
const conexion = $("#conexion"), mensaje = $("#mensaje"), guardar = $("#guardar"), modal = $("#modal");
let catalogos = null, codOtEditando = null, ordenes = [], perfil = null, sistemaCargado = false, autenticando = false;
let modoRecuperacion = false, correoRecuperacion = "", temporizadorReenvio = null;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_URL.includes("PEGA_AQUI") || SUPABASE_PUBLISHABLE_KEY.includes("PEGA_AQUI")) throw new Error("Completa config.js");
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const escapar = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const errorLegible = e => e?.message || e?.details || "Ocurrió un error inesperado.";
function mostrarMensaje(texto, tipo = "ok") { mensaje.textContent = texto; mensaje.className = `msg ${tipo}`; mensaje.setAttribute("role", "alert"); }
function mostrarLoginMensaje(texto, tipo = "error") { const box = $("#login-mensaje"); box.textContent = texto; box.className = texto ? `msg ${tipo}` : ""; }
const esAdministrador = () => perfil?.rol === "Administrador";
function limpiarEstadoSensible() { perfil = null; catalogos = null; ordenes = []; sistemaCargado = false; codOtEditando = null; $("#lista").innerHTML = ""; $("#lista-usuarios").innerHTML = ""; mensaje.textContent = ""; if (modal.open) modal.close(); }
function detenerTemporizadorReenvio() { if (temporizadorReenvio) clearInterval(temporizadorReenvio); temporizadorReenvio = null; }
function mostrarVistaAuth(id) { ["login-form","recuperar-form","verificar-form","nueva-password-form"].forEach(formId => { $(`#${formId}`).hidden = formId !== id; }); $("#pantalla-cargando").hidden = true; $("#pantalla-sistema").hidden = true; $("#pantalla-login").hidden = false; }
function limpiarRecuperacion() { detenerTemporizadorReenvio(); correoRecuperacion = ""; ["#recuperar-email","#codigo-recuperacion","#recuperacion-password","#recuperacion-confirmar"].forEach(id => { $(id).value = ""; }); $("#mostrar-password-recuperacion").checked = false; $("#recuperacion-password").type = "password"; $("#recuperacion-confirmar").type = "password"; ["#recuperar-mensaje","#verificar-mensaje","#nueva-password-mensaje"].forEach(id => { $(id).textContent = ""; $(id).className = ""; }); }
function mostrarLogin() { modoRecuperacion = false; limpiarRecuperacion(); limpiarEstadoSensible(); mostrarVistaAuth("login-form"); $("#login-password").value = ""; }
function mostrarMensajeAuth(selector, texto, tipo = "error") { const box = $(selector); box.textContent = texto; box.className = texto ? `msg ${tipo}` : ""; }
function enmascararCorreo(email) { const [usuario, dominio] = email.split("@"); if (!dominio) return "***"; const visibles = usuario.slice(0, Math.min(2, usuario.length)); return `${visibles}${"*".repeat(Math.max(3, usuario.length - visibles.length))}@${dominio}`; }
function iniciarTemporizadorReenvio(segundos = 45) { detenerTemporizadorReenvio(); const boton = $("#reenviar-codigo"); let restante = segundos; boton.disabled = true; boton.textContent = `Reenviar código en ${restante} s`; temporizadorReenvio = setInterval(() => { restante -= 1; if (restante <= 0) { detenerTemporizadorReenvio(); boton.disabled = false; boton.textContent = "Reenviar código"; return; } boton.textContent = `Reenviar código en ${restante} s`; }, 1000); }
function abrirRecuperacion() { modoRecuperacion = true; correoRecuperacion = ""; mostrarLoginMensaje(""); $("#recuperar-email").value = $("#login-email").value.trim(); mostrarVistaAuth("recuperar-form"); $("#recuperar-email").focus(); }
async function cancelarRecuperacion() { try { const { data } = await supabase.auth.getSession(); if (data.session) await supabase.auth.signOut({ scope: "local" }); } finally { mostrarLogin(); } }
function mostrarSeccion(nombre) { if (nombre === "usuarios" && !esAdministrador()) nombre = "ordenes"; document.querySelectorAll(".app-section").forEach(x => x.hidden = x.id !== `seccion-${nombre}`); document.querySelectorAll("[data-section]").forEach(x => x.classList.toggle("active", x.dataset.section === nombre)); }
function opcion(valor, texto) { const o = document.createElement("option"); o.value = valor; o.textContent = texto; return o; }
function selector(filas, clave, etiqueta, clase = "") { const s = document.createElement("select"); s.className = clase; s.append(opcion("", "Seleccionar...")); for (const fila of filas ?? []) s.append(opcion(fila[clave], etiqueta(fila))); return s; }
function selectorPrincipal(id, filas, clave, etiqueta) { const s = selector(filas, clave, etiqueta); s.id = id; s.required = true; $(`#${id}`).replaceWith(s); }
function celda(contenido) { const td = document.createElement("td"); contenido instanceof Node ? td.append(contenido) : td.textContent = contenido; return td; }
function campo(clase, tipo = "text", placeholder = "Opcional") { const e = document.createElement("input"); e.className = clase; e.type = tipo; e.placeholder = placeholder; if (tipo === "number") e.min = "0"; return e; }
function selectorCara(clase) { const s = document.createElement("select"); s.className = clase; for (const cara of CARAS) s.append(opcion(cara, cara)); return s; }

function renderMateriales(rows) { const body = $("#materiales"); body.innerHTML = ""; for (let p = 1; p <= 3; p++) { const material = selector(rows, "cod_material", x => `${x.cod_material} - ${x.nombre_material}`, "material-select"), tamano = campo("material-size"), formato = campo("material-format"), hojas = campo("material-sheets", "number", "0"); material.addEventListener("change", () => { const r = rows.find(x => String(x.cod_material) === material.value); tamano.value = r?.tamano_material ?? ""; formato.value = r?.formato ?? ""; }); const tr = document.createElement("tr"); tr.dataset.position = p; tr.append(celda(p), celda(material), celda(tamano), celda(formato), celda(hojas)); body.append(tr); } }
function renderColorimetrias(rows) { const body = $("#colorimetrias"); body.innerHTML = ""; for (let p = 1; p <= 3; p++) { const tr = document.createElement("tr"); tr.dataset.position = p; tr.append(celda(p), celda(selector(rows, "cod_color", x => `${x.cod_color} - ${x.nombre_color}`, "color-select")), celda(selectorCara("color-face"))); body.append(tr); } }
function renderTres(contenedor, rows, clave, etiqueta, clase) { const body = $(contenedor); body.innerHTML = ""; for (let p = 1; p <= 3; p++) { const tr = document.createElement("tr"); tr.dataset.position = p; tr.append(celda(p), celda(selector(rows, clave, etiqueta, clase))); body.append(tr); } }
function renderAcabados(rows) { const box = $("#acabados"); box.innerHTML = ""; for (const acabado of rows ?? []) { const item = document.createElement("article"); item.className = "acabado-item"; const label = document.createElement("label"); label.className = "check acabado-check"; const check = document.createElement("input"); check.type = "checkbox"; check.name = "acabados"; check.value = acabado.cod_acabado; const titulo = document.createElement("span"); titulo.textContent = `${acabado.cod_acabado} - ${acabado.tipo_acabado}`; label.append(check, titulo); const detalle = document.createElement("div"); detalle.className = "acabado-detail"; detalle.hidden = true; const faceLabel = document.createElement("label"); faceLabel.textContent = "Cara"; const cara = selectorCara("finish-face"); cara.disabled = true; faceLabel.append(cara); detalle.append(faceLabel); check.addEventListener("change", () => { cara.disabled = !check.checked; detalle.hidden = !check.checked; item.classList.toggle("selected", check.checked); }); item.append(label, detalle); box.append(item); } }
function renderCatalogos() { const d = catalogos; selectorPrincipal("cod_cliente", d.clientes, "cod_cliente", x => `${x.cod_cliente} - ${x.nombre_comercial}`); selectorPrincipal("cod_trabajo", d.trabajos, "cod_trabajo", x => `${x.cod_trabajo} - ${x.tipo_trabajo}`); renderMateriales(d.materiales); renderColorimetrias(d.colores); renderTres("#impresiones", d.impresiones, "cod_impresion", x => `${x.cod_impresion} - ${x.tipo_impresion}`, "print-select"); renderTres("#maquinas", d.maquinas, "cod_maquina", x => `${x.cod_maquina} - ${x.nombre_maquina.trim()}`, "machine-select"); renderTres("#muestras", d.muestras, "cod_muestra", x => `${x.cod_muestra} - ${x.tipo_muestra}`, "sample-select"); renderAcabados(d.acabados); }

function posicionadas(contenedor, clase, clave) { return [...document.querySelectorAll(`${contenedor} tr`)].flatMap(f => { const v = f.querySelector(clase).value; return v ? [{ posicion: Number(f.dataset.position), [clave]: Number(v) }] : []; }); }
function construirPayload() {
  const materiales = [...document.querySelectorAll("#materiales tr")].flatMap(f => { const id = f.querySelector(".material-select").value, tamano = f.querySelector(".material-size").value.trim(), formato = f.querySelector(".material-format").value.trim(), hojas = f.querySelector(".material-sheets").value; if (!id) { if (tamano || formato || hojas) throw new Error(`Selecciona el material de la posición ${f.dataset.position}.`); return []; } if (!tamano || !formato || hojas === "") throw new Error(`Completa tamaño, formato y total de hojas del material en la posición ${f.dataset.position}.`); if (!Number.isFinite(Number(hojas)) || Number(hojas) < 0) throw new Error(`Total de hojas inválido en la posición ${f.dataset.position}.`); return [{ posicion: Number(f.dataset.position), cod_material: Number(id), tamano_material: tamano, formato, total_hojas: Number(hojas) }]; });
  const colorimetrias = [...document.querySelectorAll("#colorimetrias tr")].flatMap(f => { const id = f.querySelector(".color-select").value; return id ? [{ posicion: Number(f.dataset.position), cod_color: Number(id), cara_color: f.querySelector(".color-face").value }] : []; });
  const maquinas = posicionadas("#maquinas", ".machine-select", "cod_maquina");
  if (new Set(maquinas.map(x => x.cod_maquina)).size !== maquinas.length) throw new Error("No puedes seleccionar la misma máquina más de una vez.");
  const acabados = [...document.querySelectorAll(".acabado-item")].flatMap(item => { const check = item.querySelector('[name="acabados"]'); return check.checked ? [{ cod_acabado: Number(check.value), cara_acabado: item.querySelector(".finish-face").value }] : []; });
  const valorNumero = id => $(id).value === "" ? null : Number($(id).value);
  return { nombre_ot: $("#nombre_ot").value.trim(), cantidad: valorNumero("#cantidad"), cantidad_paginas: valorNumero("#cantidad_paginas"), fecha_ot: $("#fecha_ot").value || null, tamano_final: $("#tamano_final").value.trim() || null, corte: $("#corte").value.trim() || null, cod_cliente: valorNumero("#cod_cliente"), cod_trabajo: valorNumero("#cod_trabajo"), materiales, colorimetrias, impresiones: posicionadas("#impresiones", ".print-select", "cod_impresion"), maquinas, muestras: posicionadas("#muestras", ".sample-select", "cod_muestra"), acabados };
}
function validar(d) { if (!d.nombre_ot) throw new Error("Nombre del trabajo es obligatorio."); if (d.cod_cliente === null || d.cod_trabajo === null) throw new Error("Cliente y tipo de trabajo son obligatorios."); if (!Number.isFinite(d.cantidad) || d.cantidad < 0 || !Number.isFinite(d.cantidad_paginas) || d.cantidad_paginas < 0) throw new Error("Las cantidades deben ser mayores o iguales a cero."); if ([...d.colorimetrias.map(x => x.cara_color), ...d.acabados.map(x => x.cara_acabado)].some(x => !CARAS.includes(x))) throw new Error("Se encontró una cara no válida."); }

async function rpc(nombre, parametros = {}) { const { data, error } = await supabase.rpc(nombre, parametros); if (error) { console.error(`Error en ${nombre}:`, { message: error.message, code: error.code, details: error.details }); if (/debe iniciar sesi[oó]n|jwt|session|token.*expired/i.test(error.message || "")) mostrarLogin(); throw error; } return data; }
async function cargarCatalogos() { const data = await rpc("ot_catalogos_formulario"); const requeridos = ["clientes", "trabajos", "materiales", "colores", "impresiones", "maquinas", "muestras", "acabados", "estados"]; if (!data || requeridos.some(x => !Array.isArray(data[x]))) throw new Error("La RPC devolvió catálogos incompletos."); catalogos = data; renderCatalogos(); conexion.textContent = "Supabase conectado"; conexion.className = "ok"; }
function badge(estado) { const clase = String(estado ?? "").toLowerCase().includes("pendiente") ? "pendiente" : String(estado ?? "").toLowerCase().includes("proceso") ? "proceso" : String(estado ?? "").toLowerCase().includes("complet") ? "completado" : ""; return `<span class="badge badge-${clase}">${escapar(estado || "Sin estado")}</span>`; }
const ICONOS = {
  ver: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  editar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20 19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>',
  estado: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-5V2"/><path d="M20 7a8 8 0 0 0-13.5-2"/><path d="M4 17h5v5"/><path d="M4 17a8 8 0 0 0 13.5 2"/></svg>',
  eliminar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>'
};
function botonAccion(accion, id, etiqueta, clase = "") { return `<button class="icon-action ${clase}" data-action="${accion}" data-id="${id}" aria-label="${etiqueta}" title="${etiqueta}">${ICONOS[accion]}<span class="sr-only">${etiqueta}</span></button>`; }
async function listarOrdenes() { $("#lista").innerHTML = '<tr><td colspan="11">Cargando...</td></tr>'; const data = await rpc("orden_trabajo_listar", { p_limite: 50 }); ordenes = Array.isArray(data) ? data : data ? [data] : []; $("#lista").innerHTML = ordenes.map(x => `<tr><td>OT ${escapar(x.cod_ot)}</td><td>${escapar(x.fecha_ot)}</td><td>${escapar(x.nombre_comercial)}</td><td>${escapar(x.nombre_ot)}</td><td>${escapar(x.tipo_trabajo)}</td><td>${escapar(x.cantidad)}</td><td>${escapar(x.materiales || "—")}</td><td>${escapar(String(x.maquinas || "—").trim())}</td><td>${escapar(x.acabados || "—")}</td><td>${badge(x.tipo_estado)}</td><td><div class="action-group">${botonAccion("ver",x.cod_ot,"Ver OT")}${botonAccion("editar",x.cod_ot,"Editar OT","secondary")}${botonAccion("estado",x.cod_ot,"Cambiar estado","secondary")}${esAdministrador() ? botonAccion("eliminar",x.cod_ot,"Eliminar OT","danger") : ""}</div></td></tr>`).join("") || '<tr><td colspan="11">No hay órdenes registradas.</td></tr>'; }
async function obtener(codOt) { const data = await rpc("orden_trabajo_obtener", { p_cod_ot: Number(codOt) }); if (!data) throw new Error(`No se encontró la OT #${codOt}.`); return Array.isArray(data) ? data[0] : data; }

const nombreCatalogo = (lista, clave, valor, texto) => catalogos[lista].find(x => String(x[clave]) === String(valor))?.[texto] ?? valor;
function listaDetalle(items, formatter) { return items?.length ? `<ul class="detail-list">${items.sort((a,b)=>(a.posicion??0)-(b.posicion??0)).map(x => `<li>${formatter(x)}</li>`).join("")}</ul>` : "—"; }
function fechaHora(valor) { if (!valor) return "—"; const d = new Date(valor); return Number.isNaN(d.getTime()) ? escapar(valor) : new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(d); }
async function verOt(codOt) { const d = await obtener(codOt); const tieneAuditoria = ["fecha_creacion","fecha_modificacion","creado_por","modificado_por"].some(k => d[k] != null); $("#modal-titulo").textContent = `Ver Orden de Trabajo #${d.cod_ot}`; $("#modal-contenido").innerHTML = `<div class="detail-grid"><div class="detail-block"><strong>Cliente</strong>${escapar(nombreCatalogo("clientes","cod_cliente",d.cod_cliente,"nombre_comercial"))}</div><div class="detail-block"><strong>Trabajo</strong>${escapar(nombreCatalogo("trabajos","cod_trabajo",d.cod_trabajo,"tipo_trabajo"))}</div><div class="detail-block"><strong>Nombre</strong>${escapar(d.nombre_ot)}</div><div class="detail-block"><strong>Estado</strong>${badge(d.estado || d.tipo_estado)}</div><div class="detail-block"><strong>Fecha</strong>${escapar(d.fecha_ot)}</div><div class="detail-block"><strong>Cantidad / páginas</strong>${escapar(d.cantidad)} / ${escapar(d.cantidad_paginas)}</div><div class="detail-block"><strong>Tamaño final / corte</strong>${escapar(d.tamano_final || "—")} / ${escapar(d.corte || "—")}</div></div><div class="detail-grid"><div class="detail-block"><strong>Materiales</strong>${listaDetalle(d.materiales,x=>`${x.posicion}: ${escapar(nombreCatalogo("materiales","cod_material",x.cod_material,"nombre_material"))} · ${escapar(x.tamano_material)} · formato ${escapar(x.formato)} · ${escapar(x.total_hojas)} hojas`)}</div><div class="detail-block"><strong>Colorimetrías</strong>${listaDetalle(d.colorimetrias,x=>`${x.posicion}: ${escapar(nombreCatalogo("colores","cod_color",x.cod_color,"nombre_color"))} (${escapar(x.cara_color)})`)}</div><div class="detail-block"><strong>Impresiones</strong>${listaDetalle(d.impresiones,x=>`${x.posicion}: ${escapar(nombreCatalogo("impresiones","cod_impresion",x.cod_impresion,"tipo_impresion"))}`)}</div><div class="detail-block"><strong>Máquinas</strong>${listaDetalle(d.maquinas,x=>`${x.posicion}: ${escapar(String(nombreCatalogo("maquinas","cod_maquina",x.cod_maquina,"nombre_maquina")).trim())}`)}</div><div class="detail-block"><strong>Muestrarios</strong>${listaDetalle(d.muestras,x=>`${x.posicion}: ${escapar(nombreCatalogo("muestras","cod_muestra",x.cod_muestra,"tipo_muestra"))}`)}</div><div class="detail-block"><strong>Acabados</strong>${listaDetalle(d.acabados,x=>`${escapar(nombreCatalogo("acabados","cod_acabado",x.cod_acabado,"tipo_acabado"))} (${escapar(x.cara_acabado)})`)}</div></div>${tieneAuditoria ? `<h3>Auditoría</h3><div class="detail-grid audit-grid"><div class="detail-block"><strong>Fecha de creación</strong>${fechaHora(d.fecha_creacion)}</div><div class="detail-block"><strong>Fecha de última modificación</strong>${fechaHora(d.fecha_modificacion)}</div><div class="detail-block"><strong>Creado por</strong>${escapar(d.creado_por || "—")}</div><div class="detail-block"><strong>Modificado por</strong>${escapar(d.modificado_por || "—")}</div></div>` : ""}`; modal.showModal(); }

function asignarPosiciones(contenedor, items, clase, clave, caraClase, caraClave) { for (const item of items ?? []) { const fila = $(`${contenedor} tr[data-position="${item.posicion}"]`); if (!fila) continue; fila.querySelector(clase).value = item[clave]; if (caraClase) fila.querySelector(caraClase).value = item[caraClave]; } }
async function editarOt(codOt) { const d = await obtener(codOt); limpiarFormulario(false); codOtEditando = Number(codOt); $("#modo").classList.add("editing"); $("#modo").innerHTML = `<strong>Modo Editar</strong><span>Editando OT #${escapar(codOt)} · El estado se cambia por separado</span>`; guardar.textContent = "Guardar cambios"; $("#cancelar-edicion").hidden = false; $("#cod_cliente").value = d.cod_cliente; $("#cod_trabajo").value = d.cod_trabajo; $("#fecha_ot").value = d.fecha_ot || ""; $("#cantidad").value = d.cantidad ?? 0; $("#cantidad_paginas").value = d.cantidad_paginas ?? 0; $("#nombre_ot").value = d.nombre_ot ?? ""; $("#tamano_final").value = d.tamano_final ?? ""; $("#corte").value = d.corte ?? ""; for (const item of d.materiales ?? []) { const f = $(`#materiales tr[data-position="${item.posicion}"]`); if (f) { f.querySelector(".material-select").value = item.cod_material; f.querySelector(".material-size").value = item.tamano_material ?? ""; f.querySelector(".material-format").value = item.formato ?? ""; f.querySelector(".material-sheets").value = item.total_hojas ?? ""; } } asignarPosiciones("#colorimetrias",d.colorimetrias,".color-select","cod_color",".color-face","cara_color"); asignarPosiciones("#impresiones",d.impresiones,".print-select","cod_impresion"); asignarPosiciones("#maquinas",d.maquinas,".machine-select","cod_maquina"); asignarPosiciones("#muestras",d.muestras,".sample-select","cod_muestra"); for (const a of d.acabados ?? []) { const check = $(`.acabado-item input[value="${a.cod_acabado}"]`); if (check) { check.checked = true; check.dispatchEvent(new Event("change")); check.closest(".acabado-item").querySelector(".finish-face").value = a.cara_acabado; } } window.scrollTo({ top: 0, behavior: "smooth" }); }
function fechaActual() { const d = new Date(); $("#fecha_ot").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function limpiarFormulario(mostrarAviso = false) { $("#form").reset(); renderCatalogos(); fechaActual(); codOtEditando = null; $("#modo").classList.remove("editing"); $("#modo").innerHTML = "<strong>Modo Crear</strong><span>Nueva orden de trabajo · Estado inicial: Pendiente</span>"; guardar.textContent = "Crear OT"; $("#cancelar-edicion").hidden = true; if (mostrarAviso) mostrarMensaje("Edición cancelada. No se guardaron cambios."); }

function cambiarEstado(codOt) { const actual = ordenes.find(x => Number(x.cod_ot) === Number(codOt)); $("#modal-titulo").textContent = `Cambiar estado de OT #${codOt}`; $("#modal-contenido").innerHTML = `<p>Estado actual: ${badge(actual?.tipo_estado)}</p><label>Nuevo estado<select id="nuevo-estado"><option value="">Seleccionar...</option>${catalogos.estados.map(x=>`<option value="${x.cod_estado}">${escapar(x.tipo_estado)}</option>`).join("")}</select></label><div class="modal-actions"><button class="secondary" data-modal-action="cancelar">Cancelar</button><button data-modal-action="guardar-estado" data-id="${codOt}">Guardar estado</button></div>`; modal.showModal(); }
function confirmarEliminar(codOt) { $("#modal-titulo").textContent = `Eliminar Orden de Trabajo #${codOt}`; $("#modal-contenido").innerHTML = `<p>¿Seguro que deseas eliminar la Orden de Trabajo #${codOt}?</p><p>Esta acción eliminará la OT y sus registros relacionados.</p><div class="modal-actions"><button class="secondary" data-modal-action="cancelar">Cancelar</button><button class="danger" data-modal-action="confirmar-eliminar" data-id="${codOt}">Eliminar definitivamente</button></div>`; modal.showModal(); }

async function listarUsuarios() { if (!esAdministrador()) throw new Error("Tu usuario no tiene permiso para realizar esta acción."); const body = $("#lista-usuarios"); body.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>'; const data = await rpc("seguridad_usuarios_listar"); const usuarios = Array.isArray(data) ? data : data ? [data] : []; body.innerHTML = usuarios.map(u => `<tr><td>${escapar(u.nombre)}</td><td>${escapar(u.correo ?? u.email)}</td><td>${escapar(u.rol)}</td><td>${fechaHora(u.fecha_creacion)}</td><td><div class="action-group"><select class="rol-select" aria-label="Nuevo rol"><option value="Usuario" ${u.rol === "Usuario" ? "selected" : ""}>Usuario</option><option value="Administrador" ${u.rol === "Administrador" ? "selected" : ""}>Administrador</option></select><button class="small" data-cod-perfil="${escapar(u.cod_perfil)}" data-current-role="${escapar(u.rol)}">Cambiar rol</button></div></td></tr>`).join("") || '<tr><td colspan="5">No hay usuarios para mostrar.</td></tr>'; }
function abrirCrearUsuario() {
  if (!esAdministrador()) throw new Error("Tu usuario no tiene permiso para realizar esta acción.");
  $("#modal-titulo").textContent = "Crear usuario";
  $("#modal-contenido").innerHTML = `
    <form id="form-crear-usuario" class="user-create-form">
      <div class="user-create-grid">
        <label>Nombre completo<input id="usuario-nombre" name="nombre" autocomplete="name" required></label>
        <label>Correo electrónico<input id="usuario-email" name="email" type="email" autocomplete="email" required></label>
        <label>Contraseña<input id="usuario-password" name="password" type="password" autocomplete="new-password" required></label>
        <label>Confirmar contraseña<input id="usuario-confirmar-password" name="confirmarPassword" type="password" autocomplete="new-password" required></label>
        <label>Rol<select id="usuario-rol" name="rol" required><option value="Usuario" selected>Usuario</option><option value="Administrador">Administrador</option></select></label>
      </div>
      <p id="crear-usuario-error" class="form-error" aria-live="polite"></p>
      <div class="modal-actions"><button class="secondary" type="button" data-modal-action="cancelar">Cancelar</button><button id="confirmar-crear-usuario" type="submit">Crear usuario</button></div>
    </form>`;
  modal.showModal();
  $("#usuario-nombre").focus();
}

function abrirCambiarPassword() {
  if (!perfil) throw new Error("Debes iniciar sesión nuevamente.");
  $("#modal-titulo").textContent = "Cambiar contraseña";
  $("#modal-contenido").innerHTML = `
    <form id="form-cambiar-password" class="user-create-form">
      <label>Contraseña actual<input id="password-actual" name="passwordActual" type="password" autocomplete="current-password" required></label>
      <label>Nueva contraseña<input id="password-nueva" name="passwordNueva" type="password" autocomplete="new-password" minlength="8" required><span class="help">Utiliza al menos 8 caracteres.</span></label>
      <label>Confirmar nueva contraseña<input id="password-confirmar" name="passwordConfirmar" type="password" autocomplete="new-password" minlength="8" required></label>
      <p id="cambiar-password-error" class="form-error" aria-live="polite"></p>
      <div class="modal-actions"><button class="secondary" type="button" data-modal-action="cancelar">Cancelar</button><button id="confirmar-cambiar-password" type="submit">Cambiar contraseña</button></div>
    </form>`;
  modal.showModal();
  $("#password-actual").focus();
}

function mensajeErrorPassword(error) {
  if (error?.code === "same_password") return "La nueva contraseña debe ser diferente de la actual.";
  if (error?.code === "weak_password") return "La nueva contraseña no cumple los requisitos de seguridad.";
  if (["invalid_credentials", "reauthentication_not_valid"].includes(error?.code)) return "La contraseña actual es incorrecta.";
  if (error?.code === "reauthentication_needed") return "Supabase requiere verificar nuevamente tu identidad antes de cambiar la contraseña.";
  return "No fue posible actualizar la contraseña. Verifica la contraseña actual e inténtalo nuevamente.";
}

async function cambiarPassword(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  const boton = $("#confirmar-cambiar-password"), errorFormulario = $("#cambiar-password-error");
  if (boton.disabled) return;
  const datos = Object.fromEntries(new FormData(formulario));
  errorFormulario.textContent = "";
  errorFormulario.className = "form-error";
  if (!datos.passwordActual || !datos.passwordNueva || !datos.passwordConfirmar) { errorFormulario.textContent = "Todos los campos son obligatorios."; errorFormulario.classList.add("msg", "error"); return; }
  if (datos.passwordNueva.length < 8) { errorFormulario.textContent = "La nueva contraseña debe tener al menos 8 caracteres."; errorFormulario.classList.add("msg", "error"); return; }
  if (datos.passwordNueva !== datos.passwordConfirmar) { errorFormulario.textContent = "Las nuevas contraseñas no coinciden."; errorFormulario.classList.add("msg", "error"); return; }

  boton.disabled = true;
  boton.textContent = "Actualizando...";
  try {
    const { data: usuarioData, error: usuarioError } = await supabase.auth.getUser();
    const email = usuarioData.user?.email;
    if (usuarioError || !email) throw new Error("No fue posible verificar la sesión actual.");
    const { error: reautenticacionError } = await supabase.auth.signInWithPassword({ email, password: datos.passwordActual });
    if (reautenticacionError) throw Object.assign(new Error("No fue posible reautenticar al usuario."), { code: reautenticacionError.code || "invalid_credentials" });
    const { error } = await supabase.auth.updateUser({ password: datos.passwordNueva, current_password: datos.passwordActual });
    if (error) throw error;
    formulario.reset();
    modal.close();
    mostrarMensaje("Contraseña actualizada correctamente.");
  } catch (error) {
    errorFormulario.textContent = mensajeErrorPassword(error);
    errorFormulario.className = "form-error msg error";
  } finally {
    boton.disabled = false;
    boton.textContent = "Cambiar contraseña";
  }
}

async function enviarCodigoRecuperacion(evento) {
  evento.preventDefault();
  const boton = $("#enviar-codigo"), emailInput = $("#recuperar-email");
  const email = emailInput.value.trim().toLowerCase();
  mostrarMensajeAuth("#recuperar-mensaje", "");
  if (!emailInput.validity.valid || !email) { mostrarMensajeAuth("#recuperar-mensaje", "Introduce un correo electrónico válido."); return; }
  if (boton.disabled) return;
  boton.disabled = true;
  boton.textContent = "Enviando código...";
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    correoRecuperacion = email;
    $("#correo-enmascarado").textContent = enmascararCorreo(email);
    mostrarVistaAuth("verificar-form");
    mostrarMensajeAuth("#verificar-mensaje", "Si existe una cuenta asociada a este correo, recibirás un código de recuperación.", "ok");
    iniciarTemporizadorReenvio();
    $("#codigo-recuperacion").focus();
  } catch {
    mostrarMensajeAuth("#recuperar-mensaje", "No fue posible procesar la solicitud. Inténtalo nuevamente en unos minutos.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar código";
  }
}

async function reenviarCodigoRecuperacion() {
  const boton = $("#reenviar-codigo");
  if (boton.disabled || !correoRecuperacion) return;
  boton.disabled = true;
  boton.textContent = "Enviando código...";
  mostrarMensajeAuth("#verificar-mensaje", "");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(correoRecuperacion);
    if (error) throw error;
    mostrarMensajeAuth("#verificar-mensaje", "Si existe una cuenta asociada a este correo, recibirás un código de recuperación.", "ok");
  } catch {
    mostrarMensajeAuth("#verificar-mensaje", "No fue posible reenviar el código. Inténtalo nuevamente más tarde.");
  } finally {
    iniciarTemporizadorReenvio();
  }
}

async function verificarCodigoRecuperacion(evento) {
  evento.preventDefault();
  const boton = $("#verificar-codigo"), input = $("#codigo-recuperacion");
  const codigo = input.value.trim();
  mostrarMensajeAuth("#verificar-mensaje", "");
  if (!codigo || !/^[A-Za-z0-9]+$/.test(codigo)) { mostrarMensajeAuth("#verificar-mensaje", "Introduce un código de verificación válido."); return; }
  if (boton.disabled || !correoRecuperacion) return;
  boton.disabled = true;
  boton.textContent = "Verificando...";
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: correoRecuperacion, token: codigo, type: "recovery" });
    if (error || !data.session) throw error || new Error("No se recibió una sesión de recuperación.");
    input.value = "";
    detenerTemporizadorReenvio();
    mostrarVistaAuth("nueva-password-form");
    $("#recuperacion-password").focus();
  } catch {
    input.select();
    mostrarMensajeAuth("#verificar-mensaje", "El código ingresado es incorrecto o ha expirado.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Verificar código";
  }
}

async function guardarPasswordRecuperacion(evento) {
  evento.preventDefault();
  const boton = $("#guardar-password-recuperacion"), nuevaPassword = $("#recuperacion-password").value, confirmacion = $("#recuperacion-confirmar").value;
  mostrarMensajeAuth("#nueva-password-mensaje", "");
  if (!nuevaPassword || !confirmacion) { mostrarMensajeAuth("#nueva-password-mensaje", "Todos los campos son obligatorios."); return; }
  if (nuevaPassword !== nuevaPassword.trim()) { mostrarMensajeAuth("#nueva-password-mensaje", "La contraseña no debe comenzar ni terminar con espacios."); return; }
  if (nuevaPassword.length < 8) { mostrarMensajeAuth("#nueva-password-mensaje", "La contraseña debe tener al menos 8 caracteres."); return; }
  if (nuevaPassword !== confirmacion) { mostrarMensajeAuth("#nueva-password-mensaje", "Las contraseñas no coinciden."); return; }
  if (boton.disabled) return;
  boton.disabled = true;
  boton.textContent = "Actualizando contraseña...";
  try {
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    if (error) throw error;
    $("#recuperacion-password").value = "";
    $("#recuperacion-confirmar").value = "";
    await supabase.auth.signOut({ scope: "local" });
    mostrarLogin();
    mostrarLoginMensaje("Tu contraseña fue actualizada correctamente. Inicia sesión con tu nueva contraseña.", "ok");
  } catch {
    mostrarMensajeAuth("#nueva-password-mensaje", "No fue posible actualizar la contraseña. Verifica los datos e inténtalo nuevamente.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar nueva contraseña";
  }
}

async function crearUsuario(evento) {
  evento.preventDefault();
  if (!esAdministrador()) { mostrarMensaje("No tienes permisos para crear usuarios.", "error"); modal.close(); return; }
  const formulario = evento.target;
  const boton = $("#confirmar-crear-usuario"), errorFormulario = $("#crear-usuario-error");
  if (boton.disabled) return;
  const datos = Object.fromEntries(new FormData(formulario));
  const nombre = datos.nombre.trim(), email = datos.email.trim(), password = datos.password, rol = datos.rol;
  errorFormulario.textContent = "";
  errorFormulario.className = "form-error";
  if (!nombre) { errorFormulario.textContent = "El nombre completo es obligatorio."; errorFormulario.classList.add("msg", "error"); return; }
  if (!formulario.elements.email.validity.valid) { errorFormulario.textContent = "Introduce un correo electrónico válido."; errorFormulario.classList.add("msg", "error"); return; }
  if (!password) { errorFormulario.textContent = "La contraseña es obligatoria."; errorFormulario.classList.add("msg", "error"); return; }
  if (password !== datos.confirmarPassword) { errorFormulario.textContent = "Las contraseñas no coinciden."; errorFormulario.classList.add("msg", "error"); return; }
  if (!["Administrador", "Usuario"].includes(rol)) { errorFormulario.textContent = "Selecciona un rol válido."; errorFormulario.classList.add("msg", "error"); return; }

  boton.disabled = true;
  boton.textContent = "Creando...";
  try {
    const { data: sesionData, error: sesionError } = await supabase.auth.getSession();
    const token = sesionData.session?.access_token;
    if (sesionError || !token) throw new Error("Debes iniciar sesión nuevamente.");
    const respuesta = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nombre, email, password, rol })
    });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(resultado.message || "No fue posible crear el usuario.");
    formulario.reset();
    modal.close();
    mostrarMensaje("Usuario creado correctamente.");
    await listarUsuarios();
  } catch (error) {
    errorFormulario.textContent = errorLegible(error);
    errorFormulario.className = "form-error msg error";
  } finally {
    boton.disabled = false;
    boton.textContent = "Crear usuario";
  }
}
async function iniciarSistema() { if (autenticando) return; autenticando = true; try { const data = await rpc("seguridad_mi_perfil"); perfil = Array.isArray(data) ? data[0] : data; if (!perfil?.rol || !["Administrador","Usuario"].includes(perfil.rol)) throw new Error("No fue posible obtener un perfil válido."); $("#perfil-nombre").textContent = perfil.nombre || "Sin nombre"; $("#perfil-rol").textContent = perfil.rol; $("#nav-usuarios").hidden = !esAdministrador(); $("#crear-usuario").hidden = !esAdministrador(); $("#pantalla-login").hidden = true; $("#pantalla-cargando").hidden = true; $("#pantalla-sistema").hidden = false; if (!sistemaCargado) { await cargarCatalogos(); sistemaCargado = true; } await listarOrdenes(); mostrarSeccion("ordenes"); } catch (error) { console.error("Error al cargar el sistema:", { message: errorLegible(error) }); mostrarLogin(); mostrarLoginMensaje(errorLegible(error)); } finally { autenticando = false; } }

$("#form").addEventListener("submit", async e => { e.preventDefault(); const textoGuardar = guardar.textContent; guardar.disabled = true; guardar.textContent = codOtEditando === null ? "Guardando..." : "Actualizando..."; try { const datos = construirPayload(); validar(datos); if (codOtEditando === null) { const data = await rpc("orden_trabajo_crear_normalizada", { p_datos: datos }); const codigo = typeof data === "object" ? data?.cod_ot : data; mostrarMensaje(`Orden de Trabajo #${codigo} creada correctamente. Estado: Pendiente`); limpiarFormulario(false); } else { const codigo = codOtEditando; await rpc("orden_trabajo_actualizar_normalizada", { p_cod_ot: codigo, p_datos: datos }); limpiarFormulario(false); mostrarMensaje(`Orden de Trabajo #${codigo} actualizada correctamente.`); } await listarOrdenes(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { guardar.disabled = false; if (codOtEditando !== null) guardar.textContent = "Guardar cambios"; else if (guardar.textContent.endsWith("...")) guardar.textContent = textoGuardar; } });
$("#lista").addEventListener("click", async e => { const boton = e.target.closest("button[data-action]"); if (!boton) return; boton.disabled = true; try { const { action, id } = boton.dataset; if (action === "ver") await verOt(id); if (action === "editar") { await editarOt(id); mostrarSeccion("nueva"); } if (action === "estado") cambiarEstado(id); if (action === "eliminar") { if (!esAdministrador()) throw new Error("Tu usuario no tiene permiso para realizar esta acción."); confirmarEliminar(id); } } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { boton.disabled = false; } });
$("#modal-contenido").addEventListener("click", async e => { const boton = e.target.closest("button[data-modal-action]"); if (!boton) return; if (boton.dataset.modalAction === "cancelar") { modal.close(); return; } boton.disabled = true; const texto = boton.textContent; try { const codOt = Number(boton.dataset.id); if (boton.dataset.modalAction === "guardar-estado") { boton.textContent = "Actualizando..."; const codEstado = Number($("#nuevo-estado").value); if (!codEstado) throw new Error("Selecciona el nuevo estado."); await rpc("orden_trabajo_cambiar_estado", { p_cod_ot: codOt, p_cod_estado: codEstado }); modal.close(); mostrarMensaje("Estado actualizado correctamente."); } else { if (!esAdministrador()) throw new Error("Tu usuario no tiene permiso para realizar esta acción."); boton.textContent = "Eliminando..."; await rpc("orden_trabajo_eliminar", { p_cod_ot: codOt }); modal.close(); if (codOtEditando === codOt) limpiarFormulario(false); mostrarMensaje("Orden eliminada correctamente."); } await listarOrdenes(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); boton.disabled = false; boton.textContent = texto; } });
$("#cerrar-modal").addEventListener("click", () => modal.close());
$("#cancelar-edicion").addEventListener("click", () => limpiarFormulario(true));
$("#recargar").addEventListener("click", async () => { try { await listarOrdenes(); mostrarMensaje("Listado actualizado."); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } });
document.querySelector(".main-nav").addEventListener("click", async e => { const boton = e.target.closest("[data-section]"); if (!boton) return; const nombre = boton.dataset.section; mostrarSeccion(nombre); if (nombre === "ordenes") { boton.disabled = true; try { await listarOrdenes(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { boton.disabled = false; } } if (nombre === "usuarios") { boton.disabled = true; try { await listarUsuarios(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { boton.disabled = false; } } });
$("#recargar-usuarios").addEventListener("click", async e => { e.currentTarget.disabled = true; try { await listarUsuarios(); mostrarMensaje("Listado de usuarios actualizado."); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { e.currentTarget.disabled = false; } });
$("#crear-usuario").addEventListener("click", () => { try { abrirCrearUsuario(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } });
$("#cambiar-password").addEventListener("click", () => { try { abrirCambiarPassword(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } });
$("#modal-contenido").addEventListener("submit", e => { if (e.target.id === "form-crear-usuario") crearUsuario(e); if (e.target.id === "form-cambiar-password") cambiarPassword(e); });
$("#lista-usuarios").addEventListener("click", async e => { const boton = e.target.closest("button[data-cod-perfil]"); if (!boton) return; const select = boton.closest("tr").querySelector(".rol-select"), nuevoRol = select.value; if (nuevoRol === boton.dataset.currentRole) { mostrarMensaje("Selecciona un rol diferente.", "error"); return; } boton.disabled = true; boton.textContent = "Actualizando..."; try { await rpc("seguridad_usuario_cambiar_rol", { p_cod_perfil: boton.dataset.codPerfil, p_rol: nuevoRol }); mostrarMensaje("Usuario actualizado correctamente."); await listarUsuarios(); if (String(boton.dataset.codPerfil) === String(perfil.cod_perfil)) await iniciarSistema(); } catch (error) { mostrarMensaje(errorLegible(error), "error"); boton.disabled = false; boton.textContent = "Cambiar rol"; } });
$("#abrir-recuperacion").addEventListener("click", abrirRecuperacion);
$("#recuperar-form").addEventListener("submit", enviarCodigoRecuperacion);
$("#verificar-form").addEventListener("submit", verificarCodigoRecuperacion);
$("#nueva-password-form").addEventListener("submit", guardarPasswordRecuperacion);
$("#reenviar-codigo").addEventListener("click", reenviarCodigoRecuperacion);
$("#volver-recuperacion").addEventListener("click", () => { detenerTemporizadorReenvio(); $("#codigo-recuperacion").value = ""; $("#recuperar-email").value = correoRecuperacion; mostrarVistaAuth("recuperar-form"); });
document.querySelectorAll(".volver-login").forEach(boton => boton.addEventListener("click", () => cancelarRecuperacion()));
$("#codigo-recuperacion").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, ""); });
$("#mostrar-password-recuperacion").addEventListener("change", e => { const tipo = e.target.checked ? "text" : "password"; $("#recuperacion-password").type = tipo; $("#recuperacion-confirmar").type = tipo; });
$("#login-form").addEventListener("submit", async e => { e.preventDefault(); const boton = $("#login-button"); boton.disabled = true; boton.textContent = "Iniciando..."; mostrarLoginMensaje(""); try { const { error } = await supabase.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-password").value }); if (error) { console.error("Error de inicio de sesión:", { message: error.message, status: error.status }); throw error; } mostrarLoginMensaje("Inicio de sesión correcto.", "ok"); await iniciarSistema(); } catch (error) { mostrarLoginMensaje("No fue posible iniciar sesión. " + errorLegible(error)); } finally { boton.disabled = false; boton.textContent = "Iniciar sesión"; } });
$("#cerrar-sesion").addEventListener("click", async e => { const boton = e.currentTarget; boton.disabled = true; boton.textContent = "Cerrando..."; try { const { error } = await supabase.auth.signOut(); if (error) throw error; mostrarLogin(); mostrarLoginMensaje("Sesión cerrada correctamente.", "ok"); } catch (error) { mostrarMensaje(errorLegible(error), "error"); } finally { boton.disabled = false; boton.textContent = "Cerrar sesión"; } });

fechaActual();
supabase.auth.onAuthStateChange((event, session) => { if (modoRecuperacion) return; if (event === "SIGNED_OUT" || !session) mostrarLogin(); else if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !perfil && !autenticando) setTimeout(() => iniciarSistema(), 0); });
try { const { data, error } = await supabase.auth.getSession(); if (error) throw error; if (data.session) await iniciarSistema(); else mostrarLogin(); } catch (error) { console.error("Error al recuperar la sesión:", { message: errorLegible(error) }); mostrarLogin(); mostrarLoginMensaje("No fue posible recuperar la sesión."); }
