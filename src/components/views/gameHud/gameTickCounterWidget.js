import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue/dist/vue.esm-bundler.js";

export const GameTickCounterWidget = defineComponent({
  name: "FxGameTickCounterWidget",
  props: {
    snapshot: { type: Object, default: null },
    positionStyle: { type: Object, default: () => ({}) },
    showTick: { type: Boolean, default: true },
    fontScale: { type: Number, default: 100 },
    counterSide: { type: String, default: "left" },
  },
  emits: ["start-move"],
  setup(props) {
    const balanceElement = ref(null);
    const headerElement = ref(null);
    const incomeElement = ref(null);
    const tickElement = ref(null);
    const totalsElement = ref(null);
    const totalTicksElement = ref(null);
    const totalCyclesElement = ref(null);
    const balanceFontSize = ref(30);
    const tickFontSize = ref(22);
    const totalsFontSize = ref(8);
    let resizeObserver = null;
    const fitBalance = () => {
      const balance = balanceElement.value;
      const header = headerElement.value;
      const income = incomeElement.value;
      if (!balance || !header || !income) return;
      const style = getComputedStyle(balance);
      const canvas = fitBalance.canvas || (fitBalance.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      if (!context) return;
      const available = Math.max(12, header.clientWidth - income.getBoundingClientRect().width - 22);
      const text = balance.textContent?.trim() || "0";
      const scale = Math.max(0.75, Math.min(1.5, Number(props.fontScale) / 100 || 1));
      const maxSize = Math.round(32 * scale);
      const minSize = Math.round(12 * scale);
      for (let size = maxSize; size >= minSize; size -= 1) {
        context.font = `800 ${size}px ${style.fontFamily}`;
        if (context.measureText(text).width <= available) {
          balanceFontSize.value = size;
          return;
        }
      }
      balanceFontSize.value = minSize;
    };
    const fitTick = () => {
      const tick = tickElement.value;
      if (!tick) return;
      const style = getComputedStyle(tick);
      const canvas = fitTick.canvas || (fitTick.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      if (!context) return;
      const scale = Math.max(0.75, Math.min(1.5, Number(props.fontScale) / 100 || 1));
      const cycleLine = tick.parentElement;
      const available = Math.max(8, (cycleLine?.clientWidth || tick.clientWidth) - 12);
      const maxSize = Math.round(24 * scale);
      const minSize = Math.round(10 * scale);
      const text = tick.textContent?.trim() || "0";
      for (let size = maxSize; size >= minSize; size -= 1) {
        context.font = `800 ${size}px ${style.fontFamily}`;
        if (context.measureText(text).width <= available) {
          tickFontSize.value = size;
          return;
        }
      }
      tickFontSize.value = minSize;
    };
    const fitTotals = () => {
      const totals = totalsElement.value;
      const tickTotal = totalTicksElement.value;
      const cycleTotal = totalCyclesElement.value;
      if (!totals || !tickTotal || !cycleTotal) return;
      const style = getComputedStyle(tickTotal);
      const canvas = fitTotals.canvas || (fitTotals.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      if (!context) return;
      const scale = Math.max(0.75, Math.min(1.5, Number(props.fontScale) / 100 || 1));
      const maxSize = Math.round(9 * scale);
      const minSize = Math.max(5, Math.round(6 * scale));
      const available = Math.max(8, totals.clientWidth / 2 - 8);
      const texts = [tickTotal.textContent?.trim() || "0", cycleTotal.textContent?.trim() || "0"];
      for (let size = maxSize; size >= minSize; size -= 1) {
        context.font = `700 ${size}px ${style.fontFamily}`;
        if (Math.max(...texts.map(text => context.measureText(text).width)) <= available) {
          totalsFontSize.value = size;
          return;
        }
      }
      totalsFontSize.value = minSize;
    };
    watch(() => [props.snapshot?.balance, props.snapshot?.income, props.snapshot?.tick, props.snapshot?.cycleTick, props.snapshot?.cycle, props.snapshot?.totalTicks, props.snapshot?.totalCycles, props.fontScale], async () => {
      await nextTick();
      fitBalance();
      fitTick();
      fitTotals();
    }, { flush: "post" });
    onMounted(() => {
      resizeObserver = new ResizeObserver(() => { fitBalance(); fitTick(); fitTotals(); });
      if (headerElement.value) resizeObserver.observe(headerElement.value);
      if (incomeElement.value) resizeObserver.observe(incomeElement.value);
      if (tickElement.value) resizeObserver.observe(tickElement.value);
      if (totalsElement.value) resizeObserver.observe(totalsElement.value);
      if (totalTicksElement.value) resizeObserver.observe(totalTicksElement.value);
      if (totalCyclesElement.value) resizeObserver.observe(totalCyclesElement.value);
      fitBalance();
      fitTick();
      fitTotals();
    });
    onBeforeUnmount(() => resizeObserver?.disconnect());
    return { balanceElement, headerElement, incomeElement, tickElement, totalsElement, totalTicksElement, totalCyclesElement, balanceFontSize, tickFontSize, totalsFontSize };
  },
  template: `
    <div v-if="snapshot && snapshot.visible !== false" class="fx-game-tick-hud" :class="[snapshot.isGrowing ? 'is-growing' : 'is-falling', snapshot.donationHighlight ? 'is-donation' : '', counterSide === 'right' ? 'is-counter-right' : '']" :style="[positionStyle,{ width: showTick ? '312px' : '232px' }]" aria-label="Balance and tick counter">
      <span v-if="showTick" class="fx-game-tick-counter" aria-label="Current tick and match totals" title="Current tick · total ticks | total cycles" @pointerdown="$emit('start-move',$event)">
        <span class="fx-game-tick-cycle"><strong ref="tickElement" :style="{ fontSize: tickFontSize + 'px' }">{{ snapshot.cycleTick }}</strong></span>
        <span ref="totalsElement" class="fx-game-tick-totals" :style="{ fontSize: totalsFontSize + 'px' }" aria-label="Total ticks and cycles">
          <span class="fx-game-tick-total"><small>Total ticks</small><strong ref="totalTicksElement">{{ snapshot.totalTicks }}</strong></span>
          <span class="fx-game-tick-total is-cycles"><small>Cycles</small><strong ref="totalCyclesElement">{{ snapshot.totalCycles }}</strong></span>
        </span>
      </span>
      <aside class="fx-game-tick-widget" aria-label="Balance and income">
        <span class="fx-game-tick-rail" aria-hidden="true"><i :style="{ height: (snapshot.tickProgress * 100) + '%' }"></i></span>
        <header ref="headerElement" class="fx-game-tick-widget-head" @pointerdown="$emit('start-move',$event)">
          <strong ref="balanceElement" class="fx-game-tick-balance" :style="{ fontSize: balanceFontSize + 'px' }">{{ snapshot.balance }}</strong>
          <span ref="incomeElement" class="fx-game-tick-income">+{{ snapshot.income }}</span>
        </header>
        <div class="fx-game-tick-meter" role="meter" :aria-valuenow="Math.round(snapshot.balanceRatio * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Current balance as a share of maximum troops" title="Current balance / max troops">
          <span :style="{ width: (snapshot.balanceRatio * 100) + '%' }"></span>
        </div>
        <span class="fx-game-tick-rail" aria-hidden="true"><i :style="{ height: (snapshot.tickProgress * 100) + '%' }"></i></span>
      </aside>
    </div>
  `,
});
