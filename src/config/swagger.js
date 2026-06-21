module.exports = {
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
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
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
      HealthProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'integer' },
          heightCm: { type: 'number', example: 175 },
          weightKg: { type: 'number', example: 72 },
          goalWeightKg: { type: 'number', example: 68 },
          bmi: { type: 'number', example: 23.5 },
          activityLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH'] },
          nutritionalObjective: { type: 'string', enum: ['LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_MUSCLE'] },
          age: { type: 'integer', example: 25 },
          biologicalSex: { type: 'string', enum: ['M', 'F'] },
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
          totalCollaborators: { type: 'integer' },
          activeCollaborators: { type: 'integer' },
          averages: {
            type: 'object',
            nullable: true,
            properties: {
              adherence: { type: 'number' },
              bmi: { type: 'number' },
            },
          },
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
    { name: 'Progress', description: 'Seguimiento de progreso, peso y alimentos' },
    { name: 'Consultations', description: 'Consultas con el nutricionista' },
    { name: 'Companies', description: 'Módulo corporativo — empresas y colaboradores' },
    { name: 'Subscriptions', description: 'Suscripciones y facturación' },
  ],
  paths: {
    // ── AUTH ──────────────────────────────────────────────────────────
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
          201: { description: 'Usuario creado exitosamente' },
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

    // ── USERS ─────────────────────────────────────────────────────────
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

    // ── PROFILE ───────────────────────────────────────────────────────
    '/api/v1/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Obtener perfil de salud del paciente',
        responses: {
          200: { description: 'Perfil de salud', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthProfile' } } } },
          404: { description: 'Perfil no encontrado' },
        },
      },
    },
    '/api/v1/profile/health-data': {
      put: {
        tags: ['Profile'],
        summary: 'Crear o actualizar datos de salud (upsert)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['heightCm', 'weightKg', 'activityLevel'],
                properties: {
                  heightCm: { type: 'number', example: 175 },
                  weightKg: { type: 'number', example: 72 },
                  goalWeightKg: { type: 'number', example: 68 },
                  activityLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH'], example: 'MODERATE' },
                  nutritionalObjective: { type: 'string', enum: ['LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_MUSCLE'] },
                  age: { type: 'integer', example: 25 },
                  biologicalSex: { type: 'string', enum: ['M', 'F'] },
                  systolicPressure: { type: 'integer', example: 118 },
                  diastolicPressure: { type: 'integer', example: 76 },
                  glucoseMgDl: { type: 'number', example: 92 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Perfil actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthProfile' } } } },
        },
      },
    },
    '/api/v1/profile/nutritional-goals': {
      get: {
        tags: ['Profile'],
        summary: 'Obtener metas nutricionales calculadas del paciente',
        responses: {
          200: { description: 'Metas nutricionales (calorías, proteínas, carbohidratos, grasas)' },
          404: { description: 'Perfil no encontrado' },
        },
      },
    },
    '/api/v1/profile/nutritional-goal': {
      put: {
        tags: ['Profile'],
        summary: 'Actualizar objetivo nutricional del paciente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nutritionalObjective'],
                properties: {
                  nutritionalObjective: { type: 'string', enum: ['LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_MUSCLE'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Objetivo actualizado' } },
      },
    },
    '/api/v1/profile/restrictions': {
      put: {
        tags: ['Profile'],
        summary: 'Actualizar restricciones alimentarias del paciente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  restrictions: { type: 'array', items: { type: 'string' }, example: ['Sin gluten', 'Sin lácteos'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Restricciones actualizadas' } },
      },
    },

    // ── NUTRITIONAL PLANS ─────────────────────────────────────────────
    '/api/v1/nutritional-plans': {
      get: {
        tags: ['Nutritional Plans'],
        summary: 'Obtener planes nutricionales (paciente: su plan activo; nutricionista: sus planes)',
        responses: {
          200: { description: 'Lista de planes nutricionales' },
        },
      },
      post: {
        tags: ['Nutritional Plans'],
        summary: 'Crear plan nutricional (solo NUTRICIONISTA)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'calorieTarget'],
                properties: {
                  name: { type: 'string', example: 'Plan Semana 1' },
                  calorieTarget: { type: 'integer', example: 1950 },
                  proteinGrams: { type: 'integer', example: 140 },
                  carbsGrams: { type: 'integer', example: 220 },
                  fatGrams: { type: 'integer', example: 65 },
                  patientId: { type: 'integer', example: 5 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Plan creado' } },
      },
    },
    '/api/v1/nutritional-plans/my-patients': {
      get: {
        tags: ['Nutritional Plans'],
        summary: 'Listar pacientes asignados con su plan y progreso (solo NUTRICIONISTA)',
        responses: {
          200: { description: 'Lista de pacientes con plan y adherencia' },
          403: { description: 'Solo nutricionistas' },
        },
      },
    },
    '/api/v1/nutritional-plans/patients/{patientId}': {
      get: {
        tags: ['Nutritional Plans'],
        summary: 'Obtener detalle completo de un paciente (solo NUTRICIONISTA)',
        parameters: [{ name: 'patientId', in: 'path', required: true, schema: { type: 'integer', example: 5 } }],
        responses: {
          200: { description: 'Detalle del paciente con plan, historial de peso y logs de alimentación' },
          404: { description: 'Paciente no encontrado para este nutricionista' },
        },
      },
    },
    '/api/v1/nutritional-plans/{planId}/status': {
      patch: {
        tags: ['Nutritional Plans'],
        summary: 'Actualizar estado del plan (ACTIVATED / REJECTED)',
        parameters: [{ name: 'planId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['ACTIVATED', 'REJECTED'] } },
              },
            },
          },
        },
        responses: { 200: { description: 'Estado actualizado' } },
      },
    },
    '/api/v1/nutritional-plans/{planId}/weekly-diet': {
      get: {
        tags: ['Nutritional Plans'],
        summary: 'Obtener dieta semanal del plan (7 días con comidas)',
        parameters: [{ name: 'planId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Dieta semanal con desayuno, almuerzo, cena y snack por día' },
          404: { description: 'Plan no encontrado' },
        },
      },
    },

    // ── PROGRESS ──────────────────────────────────────────────────────
    '/api/v1/progress/charts': {
      get: {
        tags: ['Progress'],
        summary: 'Obtener gráficos de progreso (peso, calorías quemadas, ingesta calórica)',
        responses: { 200: { description: 'Datos de gráficos de progreso' } },
      },
    },
    '/api/v1/progress/weight-records': {
      get: {
        tags: ['Progress'],
        summary: 'Historial de registros de peso del paciente',
        responses: { 200: { description: 'Lista de registros de peso ordenados por fecha' } },
      },
    },
    '/api/v1/progress/weight-update': {
      post: {
        tags: ['Progress'],
        summary: 'Registrar peso del día',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['weightKg'],
                properties: {
                  weightKg: { type: 'number', example: 71.5 },
                  notes: { type: 'string', example: 'Después del entrenamiento' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Registro de peso guardado' } },
      },
    },
    '/api/v1/progress/food-logs': {
      get: {
        tags: ['Progress'],
        summary: 'Historial de registro de alimentos del paciente',
        responses: { 200: { description: 'Lista de alimentos registrados ordenados por fecha' } },
      },
    },
    '/api/v1/progress/food-log': {
      post: {
        tags: ['Progress'],
        summary: 'Registrar consumo de alimento',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mealType', 'foodName', 'calories'],
                properties: {
                  mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], example: 'BREAKFAST' },
                  foodName: { type: 'string', example: 'Avena con leche' },
                  calories: { type: 'number', example: 380 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Consumo de alimento registrado' } },
      },
    },
    '/api/v1/progress/activity-history': {
      get: {
        tags: ['Progress'],
        summary: 'Historial de actividad física del paciente',
        responses: { 200: { description: 'Lista de actividades registradas ordenadas por fecha' } },
      },
    },
    '/api/v1/progress/activity-log': {
      post: {
        tags: ['Progress'],
        summary: 'Registrar actividad física',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['activityType', 'durationMinutes'],
                properties: {
                  activityType: { type: 'string', example: 'Caminata' },
                  durationMinutes: { type: 'integer', example: 30 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Actividad física registrada' } },
      },
    },

    // ── CONSULTATIONS ─────────────────────────────────────────────────
    '/api/v1/consultations': {
      get: {
        tags: ['Consultations'],
        summary: 'Listar consultas (paciente: las suyas; nutricionista: las de sus pacientes)',
        responses: { 200: { description: 'Lista de consultas' } },
      },
      post: {
        tags: ['Consultations'],
        summary: 'Crear nueva consulta (solo NUTRICIONISTA)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['patientId', 'date'],
                properties: {
                  patientId: { type: 'integer', example: 5 },
                  date: { type: 'string', format: 'date', example: '2026-06-21' },
                  topic: { type: 'string', example: 'Revisión de plan nutricional' },
                  notes: { type: 'string', example: 'Paciente con buena adherencia' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Consulta creada' },
          403: { description: 'Solo nutricionistas pueden crear consultas' },
        },
      },
    },

    // ── COMPANIES ─────────────────────────────────────────────────────
    '/api/v1/companies/corporate-client': {
      get: {
        tags: ['Companies'],
        summary: 'Ver empresa asignada al nutricionista autenticado',
        responses: {
          200: { description: 'Empresa vinculada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
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
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: {
            description: 'Lista de colaboradores',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Collaborator' } } } },
          },
        },
      },
    },
    '/api/v1/companies/{companyId}/collaborators/upload': {
      post: {
        tags: ['Companies'],
        summary: 'Carga masiva de colaboradores vía JSON (CSV parseado en frontend)',
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
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
        summary: 'Métricas grupales anonimizadas de bienestar corporativo',
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Métricas del grupo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Metrics' } } } },
          404: { description: 'Empresa no encontrada' },
        },
      },
    },

    // ── SUBSCRIPTIONS ─────────────────────────────────────────────────
    '/api/v1/subscriptions/plans': {
      get: {
        tags: ['Subscriptions'],
        summary: 'Listar planes de suscripción disponibles',
        responses: { 200: { description: 'Lista de planes (Basico, Profesional, Premium)' } },
      },
    },
    '/api/v1/subscriptions/active': {
      get: {
        tags: ['Subscriptions'],
        summary: 'Ver suscripción activa del usuario autenticado',
        responses: {
          200: { description: 'Suscripción activa con historial de pagos (null si no tiene)' },
        },
      },
    },
    '/api/v1/subscriptions/activate': {
      post: {
        tags: ['Subscriptions'],
        summary: 'Activar una suscripción',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['planId', 'startDate'],
                properties: {
                  planId: { type: 'integer', example: 1 },
                  startDate: { type: 'string', format: 'date', example: '2026-06-21' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Suscripción activada con pago y factura generados' } },
      },
    },
    '/api/v1/subscriptions/{subscriptionId}/suspend': {
      patch: {
        tags: ['Subscriptions'],
        summary: 'Suspender suscripción activa',
        parameters: [{ name: 'subscriptionId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Suscripción suspendida' },
          404: { description: 'Suscripción no encontrada' },
        },
      },
    },
    '/api/v1/subscriptions/{subscriptionId}/reactivate': {
      patch: {
        tags: ['Subscriptions'],
        summary: 'Reactivar suscripción suspendida',
        parameters: [{ name: 'subscriptionId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Suscripción reactivada con nuevo pago y factura' },
          404: { description: 'Suscripción no encontrada' },
        },
      },
    },
    '/api/v1/subscriptions/{subscriptionId}/renewal': {
      post: {
        tags: ['Subscriptions'],
        summary: 'Renovar suscripción (genera nuevo pago y extiende fecha de cobro)',
        parameters: [{ name: 'subscriptionId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Suscripción renovada' },
          404: { description: 'Suscripción no encontrada' },
        },
      },
    },
    '/api/v1/subscriptions/{subscriptionId}/billing-summary': {
      get: {
        tags: ['Subscriptions'],
        summary: 'Resumen de facturación de la suscripción',
        parameters: [{ name: 'subscriptionId', in: 'path', required: true, schema: { type: 'integer', example: 1 } }],
        responses: {
          200: { description: 'Resumen con historial de pagos, facturas pendientes y saldo' },
          404: { description: 'Suscripción no encontrada' },
        },
      },
    },
  },
}
