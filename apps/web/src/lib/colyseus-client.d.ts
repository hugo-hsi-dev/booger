export type JoinOptions = Record<string, unknown>;

export type SeatReservation = {
  name: string;
  roomId: string;
  processId: string;
  sessionId: string;
  protocol?: string;
  reconnectionToken?: string;
  devMode?: boolean;
};

export type Room<State = any> = {
  roomId: string;
  sessionId: string;
  reconnectionToken?: string;
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
  http: {
    post<T = any>(path: string, options?: { headers?: Record<string, string>; body?: string }): Promise<{ data: T }>;
  };
  constructor(endpoint: string);
  consumeSeatReservation<State = any>(response: SeatReservation, rootSchema?: any): Promise<Room<State>>;
}
