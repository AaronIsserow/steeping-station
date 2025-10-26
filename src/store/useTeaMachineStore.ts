import { create } from "zustand";
import { BluetoothManager, TeaMachineState } from "@/lib/bluetooth";

// Re-export for type resolution
export type { TeaMachineState } from "@/lib/bluetooth";

interface TeaMachineStore {
  isConnected: boolean;
  state: TeaMachineState | null;
  bluetoothManager: BluetoothManager;
  lastCupServedShown: boolean;
  
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: string) => Promise<void>;
  setState: (state: TeaMachineState) => void;
  setConnected: (connected: boolean) => void;
  markCupServedShown: () => void;
}

const initialState: TeaMachineState = {
  sys: "OFF",
  tea: "BLACK",
  T: 0,
  heater: 0,
  heating: 0,
  brew: "IDLE",
  brew_ms: 0,
  brew_total: 0,
  pump: 0,
  dispense: "NONE",
  needs_refill: 0,
  event: "NONE",
  water_ml: 0,
  tank_pct: 0,
  leaf_tcum_ms: 0,
  leaf_tmax_ms: 0,
  leaf_ok: 1,
  next_soak_ms: 0,
};

export const useTeaMachineStore = create<TeaMachineStore>((set, get) => ({
  isConnected: false,
  state: null,
  bluetoothManager: new BluetoothManager(),
  lastCupServedShown: false,

  connect: async () => {
    const { bluetoothManager } = get();
    
    try {
      await bluetoothManager.connect(
        (state) => {
          set({ state });
          
          // Reset cup served flag when new event comes in
          if (state.event === "CUP_SERVED" && !get().lastCupServedShown) {
            set({ lastCupServedShown: false });
          } else if (state.event === "NONE") {
            set({ lastCupServedShown: false });
          }
        },
        () => {
          set({ isConnected: false, state: null });
        }
      );
      
      set({ isConnected: true });
    } catch (error) {
      console.error("Connection failed:", error);
      throw error;
    }
  },

  disconnect: () => {
    const { bluetoothManager } = get();
    bluetoothManager.disconnect();
    set({ isConnected: false, state: null });
  },

  sendCommand: async (command: string) => {
    const { bluetoothManager } = get();
    await bluetoothManager.sendCommand(command);
  },

  setState: (state: TeaMachineState) => {
    set({ state });
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  markCupServedShown: () => {
    set({ lastCupServedShown: true });
  },
}));
