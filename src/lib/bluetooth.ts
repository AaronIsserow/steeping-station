// Web Bluetooth types
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
    };
  }
}

interface RequestDeviceOptions {
  filters?: { namePrefix?: string }[];
  optionalServices?: string[];
}

interface BluetoothDevice {
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(event: string, callback: () => void): void;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  addEventListener(event: string, callback: (event: Event) => void): void;
}

// Web Bluetooth service and characteristic UUIDs
export const BLE_SERVICE_UUID = "0000a000-0000-1000-8000-00805f9b34fb";
export const BLE_COMMAND_UUID = "0000a001-0000-1000-8000-00805f9b34fb";
export const BLE_STATE_UUID = "0000a002-0000-1000-8000-00805f9b34fb";

// Tea Machine state interface with all device fields
export interface TeaMachineState {
  sys: "ON" | "OFF";
  tea: "BLACK" | "GREEN";
  T: number;
  heater: 0 | 1;
  heating: 0 | 1;
  brew: "IDLE" | "LOWERING" | "SOAKING" | "RAISING" | "DONE";
  brew_ms: number;
  brew_total: number;
  pump: 0 | 1;
  dispense: "NONE" | "TASTE" | "CUP";
  needs_refill: 0 | 1;
  event: "NONE" | "CUP_SERVED" | "LEAF_REPLACE_REQUIRED" | "LEAVES_RESET";
  water_ml: number;
  tank_pct: number;
  leaf_tcum_ms: number;
  leaf_tmax_ms: number;
  leaf_ok: 0 | 1;
  next_soak_ms: number;
}

export class BluetoothManager {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private commandChar: BluetoothRemoteGATTCharacteristic | null = null;
  private stateChar: BluetoothRemoteGATTCharacteristic | null = null;
  private onStateUpdate: ((state: TeaMachineState) => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  async connect(
    onStateCallback: (state: TeaMachineState) => void,
    onDisconnectCallback: () => void
  ): Promise<void> {
    try {
      this.onStateUpdate = onStateCallback;
      this.onDisconnect = onDisconnectCallback;

      // Request device
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "TeaMachine" }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      if (!this.device.gatt) {
        throw new Error("GATT not available");
      }

      // Connect to GATT server
      this.server = await this.device.gatt.connect();

      // Get service
      const service = await this.server.getPrimaryService(BLE_SERVICE_UUID);

      // Get characteristics
      this.commandChar = await service.getCharacteristic(BLE_COMMAND_UUID);
      this.stateChar = await service.getCharacteristic(BLE_STATE_UUID);

      // Listen for disconnection
      this.device.addEventListener("gattserverdisconnected", () => {
        this.handleDisconnect();
      });

      // Start notifications for state updates
      await this.stateChar.startNotifications();
      this.stateChar.addEventListener("characteristicvaluechanged", (event: Event) => {
        const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (!value) return;

        const decoder = new TextDecoder();
        const text = decoder.decode(value);

        try {
          const state = JSON.parse(text) as TeaMachineState;
          this.onStateUpdate?.(state);
        } catch (error) {
          console.error("Failed to parse state JSON:", error);
        }
      });
    } catch (error) {
      console.error("Bluetooth connection failed:", error);
      throw error;
    }
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.commandChar) {
      throw new Error("Not connected to device");
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(command + "\n");

    try {
      await this.commandChar.writeValueWithoutResponse(data);
    } catch (error) {
      console.error("Failed to send command:", error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.handleDisconnect();
  }

  private handleDisconnect(): void {
    this.device = null;
    this.server = null;
    this.commandChar = null;
    this.stateChar = null;
    this.onDisconnect?.();
  }

  isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  static isBluetoothAvailable(): boolean {
    return "bluetooth" in navigator;
  }
}
