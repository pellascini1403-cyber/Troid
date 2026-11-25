# Prompt 25 — Auditoría integral y camino a producción

> Registro de trabajo, en el orden en que ocurrió: primero **medir y leer** (§2–§4), después **ordenar** (§5) y después **hacer** (§6). Lo que sigue es el estado real, no el plan.
> Leyenda de la evidencia: ✅ comprobado ejecutándolo en esta sesión · 🔎 medido (en este entorno: Chromium con GL por *software*, sin hardware físico) · 📖 leído en el código o en la CI, sin ejecutar · ❌ no existe.
> Cada hallazgo es un **fallo confirmado** (algo que falló y se vio fallar), un **riesgo potencial** (algo que puede fallar y no se ha visto fallar) o una **mejora opcional**: no se mezclan.

## 1. El mandato

Continuar F1–F7 (la rama `claude/troid-vertical-slice`, último commit informado `934a929`) llevando el proyecto hacia producción: estabilidad, rendimiento, arquitectura, jugabilidad, controles móviles, interfaz, guardado, audio, localización, accesibilidad, monetización, seguridad, pruebas, CI, distribución y documentación. Auditar **todo**, no solo lo que el encargo nombra; ordenar en P0–P3; ejecutar P0 y P1 en fases pequeñas, con pruebas, escenas reales, medida y documentación tras cada una; **no** ocultar fallos, **no** desactivar pruebas, **no** cambiar diseños aprobados, **no** declarar nada «listo» porque los tests estén verdes.

## 2. Cómo se obtuvo este diagnóstico

| Comprobación | Cómo | Resultado |
|---|---|---|
| Estado de la rama y de la CI | `git`, `gh run list` / `gh run view` | `934a929`; CI nº 149, 150 y 151 **en verde** (tres seguidas); las nº 142–148 en rojo: causas en §4.2 |
| Qué ocupa el arranque en frío | los mapas de fuentes de cada trozo del *build* (`dist/assets/*.map`) decodificados con un guion propio (`mappings` VLQ → bytes por módulo, repartidos en gzip por la razón del trozo) | §4.1 |
| Estabilidad de las pruebas | la suite completa con informe JSON (duraciones por prueba) y una segunda pasada con el límite por defecto **a la mitad** (`--testTimeout=2500`), para ver qué pruebas gastan casi todo su margen | §4.2 |
| Ciclos de dependencias y código muerto | un grafo de importaciones de `src/` (estáticas y dinámicas), componentes fuertemente conexos de Tarjan, alcanzabilidad desde `src/app/main.ts` | §4.3 |
| Coste de CPU de los rigs | el laboratorio (`?lab=rigs&crowd=10`), `RigActor.sync` por criatura y fotograma, las 34 especies | §4.14 |
| Texto cortado | un detector nuevo (`tools/e2e/fit.ts`) pasado por cada pantalla del menú y por lo que se dibuja sobre el juego, en dos idiomas y tres ventanas | §4.9 |
| Todo lo demás | lectura del código y de las bitácoras (PROMPT4–24), ejecución de los guiones de auditoría de §4 | cada apartado dice cuál |

**No medido, y por tanto no afirmado:** nada en un dispositivo físico (iOS, Android, mando, pantalla táctil real), ni el tiempo de un fotograma en un teléfono, ni batería ni temperatura, ni Safari de iPhone (el WebKit de CI es el de Linux). Los números de CPU de este entorno valen para comparar una versión con otra, no como cifras de un móvil.

