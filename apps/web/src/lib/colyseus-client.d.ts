export type JoinOptions = Record<string, unknown>;

export type Room<State = any> = {
  roomId: string;
  sessionId: string;
  name: string;
  state: State;
  send<T = any>(type: string | number, message?: T): void;
  leave(consented?: boolean): Promise<number>;
  removeAllListeners(): void;
  onStateChange: ((cb: (state: State) => void) => void) & {
    once(cb: (state: State) => void): void;
    remove(cb: (state: State) => void): void;
  };
  onError: ((cb: (code: number, message?: string) => void) => void) & {
    once(cb: (code: number, message?: string) => void): void;
    remove(cb: (code: number, message?: string) => void): void;
  };
  onLeave: ((cb: (code: number, reason?: string) => void) => void) & {
    once(cb: (code: number, reason?: string) => void): void;
    remove(cb: (code: number, reason?: string) => void): void;
  };
};

export declare class Client {
  constructor(endpoint: string);
  create<State = any>(roomName: string, options?: JoinOptions): Promise<Room<State>>;
  joinById<State = any>(roomId: string, options?: JoinOptions): Promise<Room<State>>;
}
