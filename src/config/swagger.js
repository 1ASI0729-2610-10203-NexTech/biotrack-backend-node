const swaggerJsdoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BioTrack API',
      version: '1.0.0',
      description: 'API REST de la plataforma de gestión nutricional BioTrack — NexTech · UPC 2026',
    },
    servers: [
      { url: 'https://biotrack-backend-node-production.up.railway.app', description: 'Producción (Railway)' },
      { url: 'http://localhost:3000', description: 'Local' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['PACIENTE', 'NUTRICIONISTA', 'ADMIN_CORPORATIVO'] },
          },
        },
        Collaborator: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string' },
            documentNumber: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'PENDING'] },
            sentAt: { type: 'string', format: 'date-time' },
          },
        },
        Company: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            ruc: { type: 'string' },
            sector: { type: 'string' },
            country: { type: 'string' },
            city: { type: 'string' },
            status: { type: 'string' },
          },
        },
        Metrics: {
          type: 'object',
          properties: {
            companyId: { type: 'integer' },
            companyName: { type: 'string' },
            sampleSize: { type: 'integer' },
            threshold: { type: 'integer' },
            averages: {
              type: 'object',
              nullable: true,
              properties: {
                adherence: { type: 'number' },
                bmi: { type: 'number' },
              },
            },
            totalCollaborators: { type: 'integer' },
            activeCollaborators: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Registro e inicio de sesión' },
      { name: 'Users', description: 'Datos del usuario autenticado' },
      { name: 'Profile', description: 'Perfil de salud del paciente' },
      { name: 'Nutritional Plans', description: 'Planes nutricionales' },
      { name: 'Progress', description: 'Seguimiento de progreso y peso' },
      { name: 'Consultations', description: 'Consultas con el nutricionista' },
      { name: 'Companies', description: 'Módulo corporativo — empresas y colaboradores' },
      { name: 'Subscriptions', description: 'Suscripciones y facturación' },
    ],
    paths: {
      // ── AUTH ──────────────────────────────────────────────────────
      '/api/v1/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Registrar nuevo usuario',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password', 'role'],
                  properties: {
                    name: { type: 'string', example: 'Ana García' },
                    email: { type: 'string', example: 'ana@example.com' },
                    password: { type: 'string', example: 'Pass1234!' },
                    role: { type: 'string', enum: ['PACIENTE', 'NUTRICIONISTA', 'ADMIN_CORPORATIVO'] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Usuario creado' },
            409: { description: 'Email ya registrado' },
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Iniciar sesión',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', example: 'carlos@biotrack.com' },
                    password: { type: 'string', example: 'Pass1234!' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login exitoso — retorna token JWT',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            401: { description: 'Credenciales inválidas' },
          },
        },
      },

      // ── USERS ─────────────────────────────────────────────────────
      '/api/v1/users/me': {
        get: {
          tags: ['Users'],
          summary: 'Obtener datos del usuario autenticado',
          responses: {
            200: { description: 'Datos del usuario', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'No autenticado' },
          },
        },
      },
      '/api/v1/users/patients': {
        get: {
          tags: ['Users'],
          summary: 'Listar pacientes asignados (solo NUTRICIONISTA)',
          responses: {
            200: { description: 'Lista de pacientes' },
            403: { description: 'Acceso denegado' },
          },
        },
      },

      // ── PROFILE ───────────────────────────────────────────────────
      '/api/v1/profile': {
        get: {
          tags: ['Profile'],
          summary: 'Obtener perfil de salud del paciente',
          responses: {
            200: { description: 'Perfil de salud' },
            404: { description: 'Perfil no encontrado' },
          },
        },
        post: {
          tags: ['Profile'],
          summary: 'Crear perfil de salud',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    weight: { type: 'number', example: 72 },
                    height: { type: 'number', example: 175 },
                    age: { type: 'integer', example: 22 },
                    biologicalSex: { type: 'string', enum: ['M', 'F'] },
                    activityLevel: { type: 'string', example: 'MODERATE' },
                    glucoseLevel: { type: 'number', example: 92 },
                    systolicPressure: { type: 'integer', example: 118 },
                    diastolicPressure: { type: 'integer', example: 76 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Perfil creado' },
          },
        },
        put: {
          tags: ['Profile'],
          summary: 'Actualizar perfil de salud',
          responses: {
            200: { description: 'Perfil actualizado' },
          },
        },
      },

      // ── NUTRITIONAL PLANS ─────────────────────────────────────────
      '/api/v1/nutritional-plans': {
        get: {
          tags: ['Nutritional Plans'],
          summary: 'Obtener plan nutricional del paciente',
          responses: {
            200: { description: 'Plan nutricional activo' },
            204: { description: 'Sin plan asignado' },
          },
        },
        post: {
          tags: ['Nutritional Plans'],
          summary: 'Crear plan nutricional (solo NUTRICIONISTA)',
          responses: {
            201: { description: 'Plan creado' },
          },
        },
      },

      // ── PROGRESS ──────────────────────────────────────────────────
      '/api/v1/progress': {
        get: {
          tags: ['Progress'],
          summary: 'Historial de registros de peso y adherencia',
          responses: {
            200: { description: 'Lista de registros' },
          },
        },
        post: {
          tags: ['Progress'],
          summary: 'Registrar peso del día',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    weight: { type: 'number', example: 72 },
                    date: { type: 'string', format: 'date', example: '2026-06-21' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Registro guardado' },
          },
        },
      },

      // ── CONSULTATIONS ─────────────────────────────────────────────
      '/api/v1/consultations': {
        get: {
          tags: ['Consultations'],
          summary: 'Listar consultas del usuario autenticado',
          responses: {
            200: { description: 'Lista de consultas' },
          },
        },
        post: {
          tags: ['Consultations'],
          summary: 'Crear nueva consulta (solo NUTRICIONISTA)',
          responses: {
            201: { description: 'Consulta creada' },
          },
        },
      },

      // ── COMPANIES ─────────────────────────────────────────────────
      '/api/v1/companies/corporate-client': {
        get: {
          tags: ['Companies'],
          summary: 'Ver empresa asignada (solo NUTRICIONISTA)',
          responses: {
            200: { description: 'Empresa vinculada al nutricionista', content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
            204: { description: 'Sin empresa asignada' },
          },
        },
      },
      '/api/v1/companies': {
        post: {
          tags: ['Companies'],
          summary: 'Registrar nueva empresa',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'ruc', 'sector', 'country', 'city'],
                  properties: {
                    name: { type: 'string', example: 'NexTech S.A.C.' },
                    ruc: { type: 'string', example: '20123456789' },
                    sector: { type: 'string', example: 'Tecnología' },
                    country: { type: 'string', example: 'Perú' },
                    city: { type: 'string', example: 'Lima' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Empresa creada' },
            409: { description: 'RUC ya registrado' },
          },
        },
      },
      '/api/v1/companies/{companyId}/collaborators': {
        get: {
          tags: ['Companies'],
          summary: 'Listar colaboradores de la empresa',
          parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: {
              description: 'Lista de colaboradores',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Collaborator' } } } },
            },
            403: { description: 'Sin acceso a esta empresa' },
          },
        },
      },
      '/api/v1/companies/{companyId}/collaborators/upload': {
        post: {
          tags: ['Companies'],
          summary: 'Carga masiva de colaboradores vía JSON',
          parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    collaborators: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          firstName: { type: 'string', example: 'Juan' },
                          lastName: { type: 'string', example: 'García' },
                          email: { type: 'string', example: 'juan@empresa.com' },
                          documentNumber: { type: 'string', example: '12345678' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: { description: 'Colaboradores cargados exitosamente' },
            400: { description: 'Lista vacía o formato inválido' },
          },
        },
      },
      '/api/v1/companies/{companyId}/metrics': {
        get: {
          tags: ['Companies'],
          summary: 'Métricas grupales anonimizadas de la empresa',
          parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Métricas del grupo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Metrics' } } } },
            403: { description: 'Sin acceso a esta empresa' },
            404: { description: 'Empresa no encontrada' },
          },
        },
      },

      // ── SUBSCRIPTIONS ─────────────────────────────────────────────
      '/api/v1/subscriptions': {
        get: {
          tags: ['Subscriptions'],
          summary: 'Ver suscripción activa',
          responses: {
            200: { description: 'Suscripción activa' },
            204: { description: 'Sin suscripción' },
          },
        },
        post: {
          tags: ['Subscriptions'],
          summary: 'Crear suscripción',
          responses: {
            201: { description: 'Suscripción creada' },
          },
        },
      },
    },
  },
  apis: [],
}

module.exports = swaggerJsdoc(options)
