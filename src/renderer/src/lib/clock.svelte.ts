// Relógio único para contagens regressivas (ex.: "bônus em 2:14"); atualiza a cada segundo.
export const clock = $state({ now: Date.now() })

setInterval(() => {
  clock.now = Date.now()
}, 1000)
