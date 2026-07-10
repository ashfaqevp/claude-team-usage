// Chart.js draws to <canvas>, which can't read CSS custom properties, so the
// grid / tick / tooltip colors have to be passed as concrete values that change
// with the theme. This returns a reactive palette keyed off useTheme()'s isDark,
// so the charts recolor the moment the top-bar toggle flips.
export function useChartTheme() {
  const { isDark } = useTheme()
  return computed(() =>
    isDark.value
      ? {
          surface: '#232220',
          grid: 'rgba(255,255,255,0.07)',
          tick: '#8B857A',
          tooltipBg: '#2A2825',
          tooltipTitle: '#EFECE4',
          tooltipBody: '#A9A395',
          tooltipBorder: 'rgba(255,255,255,0.10)',
        }
      : {
          surface: '#FFFFFF',
          grid: 'rgba(38,35,30,0.08)',
          tick: '#9C958A',
          tooltipBg: '#26241F',
          tooltipTitle: '#FFFFFF',
          tooltipBody: '#D9D3C7',
          tooltipBorder: 'rgba(0,0,0,0.10)',
        },
  )
}
