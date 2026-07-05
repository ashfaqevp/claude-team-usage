import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'

// Registered once, client-only (canvas doesn't exist during SSR) - every chart
// component in this app draws either a doughnut or a stacked bar, so this is the
// full set either needs.
export default defineNuxtPlugin(() => {
  Chart.register(ArcElement, DoughnutController, BarElement, BarController, CategoryScale, LinearScale, Tooltip, Legend)
})
