import assert from "node:assert/strict";
import test from "node:test";
import { crearUsuarioHandler } from "../api/usuarios/crear.js";

function respuesta() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(nombre, valor) { this.headers[nombre] = valor; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function consulta(resultado) {
  const cadena = {
    select() { return cadena; },
    eq() { return cadena; },
    update() { return cadena; },
    maybeSingle() { return Promise.resolve(resultado); },
    then(resolve, reject) { return Promise.resolve(resultado).then(resolve, reject); }
  };
  return cadena;
}

function clienteFalso({ rolSolicitante = "Administrador", crearError = null, perfilNuevo = true } = {}) {
  const estado = { eliminado: null, creado: null };
  const roles = [
    { cod_rol: 1, rol: "Administrador" },
    { cod_rol: 2, rol: "Usuario" }
  ];
  const cliente = {
    auth: {
      async getUser(token) { return token === "jwt-valido" ? { data: { user: { id: "admin-id" } }, error: null } : { data: {}, error: new Error("JWT inválido") }; },
      admin: {
        async createUser(datos) { estado.creado = datos; return crearError ? { data: {}, error: crearError } : { data: { user: { id: "nuevo-id" } }, error: null }; },
        async deleteUser(id) { estado.eliminado = id; return { error: null }; }
      }
    },
    from(tabla) {
      if (tabla === "rol") return consulta({ data: roles, error: null });
      const codRol = rolSolicitante === "Administrador" ? 1 : 2;
      const q = consulta({ data: { cod_perfil: "admin-id", cod_rol: codRol }, error: null });
      q.update = datos => { estado.actualizacion = datos; return consulta({ data: perfilNuevo ? { cod_perfil: "nuevo-id", cod_rol: datos.cod_rol, nombre: datos.nombre } : null, error: perfilNuevo ? null : new Error("Fallo de perfil") }); };
      return q;
    }
  };
  return { cliente, estado };
}

function solicitud(body = {}) {
  return { method: "POST", headers: { authorization: "Bearer jwt-valido" }, body };
}

const cuerpoValido = { nombre: "Persona", email: "persona@example.com", password: "clave-segura", rol: "Usuario" };

test.before(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "solo-pruebas";
});

test("rechaza una solicitud sin sesión", async () => {
  const res = respuesta();
  const { cliente } = clienteFalso();
  await crearUsuarioHandler({ method: "POST", headers: {}, body: cuerpoValido }, res, () => cliente);
  assert.equal(res.statusCode, 401);
});

test("rechaza con 403 a un usuario que no es Administrador", async () => {
  const res = respuesta();
  const { cliente, estado } = clienteFalso({ rolSolicitante: "Usuario" });
  await crearUsuarioHandler(solicitud(cuerpoValido), res, () => cliente);
  assert.equal(res.statusCode, 403);
  assert.equal(estado.creado, null);
});

test("un Administrador crea una cuenta confirmada y asigna Usuario", async () => {
  const res = respuesta();
  const { cliente, estado } = clienteFalso();
  await crearUsuarioHandler(solicitud(cuerpoValido), res, () => cliente);
  assert.equal(res.statusCode, 201);
  assert.equal(estado.creado.email_confirm, true);
  assert.equal(estado.creado.user_metadata.nombre, "Persona");
  assert.deepEqual(estado.actualizacion, { cod_rol: 2, nombre: "Persona" });
});

test("un Administrador puede asignar el rol Administrador", async () => {
  const res = respuesta();
  const { cliente, estado } = clienteFalso();
  await crearUsuarioHandler(solicitud({ ...cuerpoValido, rol: "Administrador" }), res, () => cliente);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(estado.actualizacion, { cod_rol: 1, nombre: "Persona" });
});

test("informa cuando el correo ya está registrado", async () => {
  const res = respuesta();
  const { cliente } = clienteFalso({ crearError: new Error("User already registered") });
  await crearUsuarioHandler(solicitud(cuerpoValido), res, () => cliente);
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.message, "Ya existe una cuenta con ese correo.");
});

test("elimina de Auth una cuenta cuyo perfil no pudo completarse", async () => {
  const res = respuesta();
  const { cliente, estado } = clienteFalso({ perfilNuevo: false });
  await crearUsuarioHandler(solicitud(cuerpoValido), res, () => cliente);
  assert.equal(res.statusCode, 500);
  assert.equal(estado.eliminado, "nuevo-id");
});
