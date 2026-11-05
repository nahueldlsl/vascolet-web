# Guía de Contribución a Vascolet Web 🎮

¡Gracias por tu interés en colaborar con **Vascolet Web**! Este proyecto busca preservar con la máxima fidelidad técnica el videojuego clásico uruguayo *Vascolet: La Máquina del Tiempo*.

---

## 🛠️ Entorno de Desarrollo

### Requisitos Previos
- [Node.js](https://nodejs.org/) v18.0.0 o superior (recomendado v20 LTS).
- [npm](https://www.npmjs.com/) v9 o superior.

### Configuración Inicial
1. Clona el repositorio:
   ```bash
   git clone https://github.com/nahueldlsl/vascolet-web.git
   cd vascolet-web
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo local con Vite:
   ```bash
   npm run dev
   ```
4. Abre `http://localhost:3000` en tu navegador.

---

## 🧪 Pruebas y Paridad Técnica

Una de las prioridades centrales del proyecto es la **paridad 1:1** con el binario x86 original (`Vascolet.exe`). Cualquier modificación a la física, cajas de colisión (AABB), timings de enemigos o transposición de coordenadas de mapas debe ir acompañada o respaldada por pruebas automatizadas:

```bash
# Ejecutar todas las pruebas unitarias y de paridad
npm test

# Ejecutar pruebas en modo observador (watch)
npm run test:watch

# Comprobar tipos con TypeScript
npm run typecheck

# Compilar para producción
npm run build
```

---

## 📋 Flujo de Trabajo para Pull Requests

1. Crea una rama descriptiva para tu cambio:
   ```bash
   git checkout -b feature/nombre-de-la-mejora
   # o
   git checkout -b fix/correccion-de-bug
   ```
2. Realiza tus cambios asegurándote de que el código siga las convenciones existentes (TypeScript limpio, variables tipadas, métodos descriptivos).
3. Asegúrate de que `npm test` y `npm run build` pasen sin errores ni warnings.
4. Escribe commits semánticos siguiendo el formato [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: nueva mecánica de patineta en el futuro`
   - `fix: resolver caja de colisión de puerta en Egipto`
   - `test: agregar caso de prueba para rebote de saltarín`
   - `docs: actualizar instrucciones de despliegue`
5. Abre una Pull Request contra la rama `main` explicando detalladamente los cambios realizados.

---

## 🐛 Reporte de Errores

Si encuentras un error o una divergencia con el comportamiento del juego original:
- Abre un issue usando la plantilla correspondiente.
- Describe el nivel o época donde ocurre (Prehistoria, Egipto, Castillo, Piratas o Futuro).
- Explica los pasos para reproducirlo y el comportamiento esperado.
- Si es posible, adjunta capturas de pantalla o un video corto.
