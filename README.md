# SGX Desmadre

Los cinco motores visuales de Spatialgineers fundidos en una sola app. No es un menú que abre cinco apps: es **una señal** que atraviesa los cinco motores, y cualquiera puede mover a los demás.

```
FUENTE → 01 STORY → 02 SPARK → 03 SYNTH → 04 NEXUS → 05 GLITCH → SALIDA
```

| Motor | Viene de | Qué aporta |
|---|---|---|
| STORY | `sgxstorytemporalvis` | 16 eras (1890s–2090s), variantes, mosaicos y máscara de pilar |
| SPARK | `sgxsparkvision` | Manos y rostro, arcos entre manos, carga y sobrecarga |
| SYNTH | `sgxsynthvisualizer` | 25 motores de imagen, doble motor con máscara, control desde el teléfono |
| NEXUS | `sgxnexus` | La imagen como nube de puntos 3D con bloom |
| GLITCH | `sgxglitch` | Bloques, rasgado, RGB, VHS, CRT y gradación |

## Cómo se mezclan

- **Cadena:** cada motor recibe lo que dejó el anterior. Los arcos de Spark pueden entrar a la señal y salir envejecidos por Story, vueltos relieve por Nexus y rotos por Glitch.
- **Rutas:** 13 señales vivas (bajos, golpe, mano, pinza, boca, carga Spark, puntero…) pueden sumar a cualquier control de cualquier motor.
- **Compartido:** una sola paleta y una sola máscara de pilar para todos.
- **Recetas:** una mezcla lista por cada pilar SGX. **Desmadre** (tecla `D`) muta los cinco motores a la vez.
- **Golpe** (barra espaciadora): sacude Synth, dispara el salto temporal de Story y rompe Glitch un instante. La sobrecarga de Spark lo dispara sola.

Atajos: `1`–`5` encienden o apagan motores, `H` oculta el HUD.

## Correr

```bash
bun install
```

```bash
bun run dev
```

Producción: `bun run build` y luego `bun run start` (Express sirve `dist/` en el puerto 3000).

## Código

- `src/state/params.ts` — el estado, la tabla de controles, las recetas y la validación de lo que llega por control remoto.
- `src/engine/FusionEngine.ts` — un solo renderer; arma la cadena de pases en cada cuadro.
- `src/engine/signals.ts`, `sparkTracker.ts` — audio y seguimiento; publican en el bus de señales.
- `src/engine/*Shader.ts` — los shaders de cada app, portados sin cambios.
- `src/engine/remote.ts` — sala PeerJS entre la pantalla y el teléfono (`?ctrl=<sala>`).

## Depende de servicios externos

- El seguimiento de Spark descarga el WASM de MediaPipe (jsDelivr) y los modelos (Google Storage) la primera vez que se usa la cámara. Sin red, o sin cámara, las manos se simulan.
- El control remoto usa el servidor público de señalización de PeerJS para emparejar; los datos viajan directo entre dispositivos.
