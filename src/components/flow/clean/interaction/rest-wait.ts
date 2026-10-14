import { useFactoryStore } from "@/store/factory-store";
import { restWait, setRestWait, TIP_WAIT_MS } from "./rest-tracker";

/**
 * Plan-mode boards make every tooltip wait 0.8 s (the mod's `Tip.Wait`); the
 * classic boards keep their immediate tips. `MinecraftTooltip` asks `restWait()`.
 */
const apply = (planMode: boolean) => setRestWait(planMode ? TIP_WAIT_MS : 0);
apply(useFactoryStore.getState().project.planMode === true);
useFactoryStore.subscribe((state) => apply(state.project.planMode === true));

export { restWait };
