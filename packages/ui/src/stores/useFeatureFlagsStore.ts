import { create } from 'zustand';

type FeatureFlagsStore = {
  planModeEnabled: boolean;
  setPlanModeEnabled: (enabled: boolean) => void;
  openWikiEnabled: boolean;
  setOpenWikiEnabled: (enabled: boolean) => void;
  openWikiAutoReveal: boolean;
  setOpenWikiAutoReveal: (enabled: boolean) => void;
};

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set) => ({
  planModeEnabled: false,
  setPlanModeEnabled: (enabled) => set({ planModeEnabled: enabled }),
  openWikiEnabled: true,
  setOpenWikiEnabled: (enabled) => set({ openWikiEnabled: enabled }),
  openWikiAutoReveal: true,
  setOpenWikiAutoReveal: (enabled) => set({ openWikiAutoReveal: enabled }),
}));
