import { createClient } from "@supabase/supabase-js";

const ROLES_PERMITIDOS = new Set(["Administrador", "Usuario"]);
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function responder(response, status, message) {
  response.status(status).json({ message });
}

function nombreRol(fila) {
  return fila?.rol ?? fila?.nombre_rol ?? fila?.tipo_rol ?? fila?.nombre;
}

async function eliminarUsuarioIncompleto(supabaseAdmin, userId) {
  if (!userId) return;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) console.error("No fue posible revertir el usuario incompleto:", error);
}

export async function crearUsuarioHandler(request, response, createClientImpl = createClient) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return responder(response, 405, "Método no permitido.");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.");
    return responder(response, 500, "El servicio de usuarios no está configurado.");
  }

  const authorization = request.headers.authorization ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return responder(response, 401, "Debes iniciar sesión.");

  const supabaseAdmin = createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(match[1]);
    const solicitante = authData?.user;
    if (authError || !solicitante) return responder(response, 401, "La sesión no es válida.");

    const { data: perfilSolicitante, error: perfilError } = await supabaseAdmin
      .from("perfil_usuario")
      .select("cod_perfil,cod_rol")
      .eq("cod_perfil", solicitante.id)
      .maybeSingle();
    if (perfilError) throw new Error(`Error consultando perfil solicitante: ${perfilError.message}`);

    const { data: roles, error: rolesError } = await supabaseAdmin.from("rol").select("*");
    if (rolesError) throw new Error(`Error consultando roles: ${rolesError.message}`);
    const rolAdministrador = roles?.find(fila => nombreRol(fila) === "Administrador");
    if (!perfilSolicitante || !rolAdministrador || String(perfilSolicitante.cod_rol) !== String(rolAdministrador.cod_rol)) {
      return responder(response, 403, "No tienes permisos para crear usuarios.");
    }

    const nombre = typeof request.body?.nombre === "string" ? request.body.nombre.trim() : "";
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const rol = typeof request.body?.rol === "string" ? request.body.rol.trim() : "";
    if (!nombre) return responder(response, 400, "El nombre completo es obligatorio.");
    if (!EMAIL_VALIDO.test(email)) return responder(response, 400, "Introduce un correo electrónico válido.");
    if (!password) return responder(response, 400, "La contraseña es obligatoria.");
    if (!ROLES_PERMITIDOS.has(rol)) return responder(response, 400, "Selecciona un rol válido.");

    const rolSolicitado = roles.find(fila => nombreRol(fila) === rol);
    if (!rolSolicitado) {
      console.error(`No se encontró el rol solicitado: ${rol}`);
      return responder(response, 500, "No fue posible asignar el rol.");
    }

    const { data: creado, error: crearError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre }
    });
    if (crearError) {
      console.error("Error creando usuario en Auth:", crearError);
      if (/already|registered|exists|duplicate/i.test(crearError.message ?? "")) {
        return responder(response, 409, "Ya existe una cuenta con ese correo.");
      }
      return responder(response, 400, "No fue posible crear el usuario.");
    }

    const userId = creado.user?.id;
    if (!userId) {
      console.error("Supabase Auth no devolvió el identificador del usuario creado.");
      return responder(response, 500, "No fue posible crear el usuario.");
    }
    try {
      let perfilCreado = null;
      let ultimoError = null;
      for (let intento = 0; intento < 5 && !perfilCreado; intento += 1) {
        const resultado = await supabaseAdmin
          .from("perfil_usuario")
          .update({ cod_rol: rolSolicitado.cod_rol, nombre })
          .eq("cod_perfil", userId)
          .select("cod_perfil,cod_rol,nombre")
          .maybeSingle();
        perfilCreado = resultado.data;
        ultimoError = resultado.error;
        if (!perfilCreado && !ultimoError) await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (ultimoError || !perfilCreado) {
        throw new Error(ultimoError?.message ?? "El trigger no creó perfil_usuario a tiempo.");
      }
      return responder(response, 201, "Usuario creado correctamente.");
    } catch (perfilAsignacionError) {
      console.error("Error asignando perfil o rol:", perfilAsignacionError);
      await eliminarUsuarioIncompleto(supabaseAdmin, userId);
      return responder(response, 500, "No fue posible asignar el rol.");
    }
  } catch (error) {
    console.error("Error inesperado creando usuario:", error);
    return responder(response, 500, "No fue posible crear el usuario.");
  }
}

export default async function handler(request, response) {
  return crearUsuarioHandler(request, response);
}
