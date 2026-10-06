declare module "mpegts.js" {
  export interface Player {
    attachMediaElement(el: HTMLMediaElement): void;
    detachMediaElement(): void;
    load(): void;
    unload(): void;
    play(): Promise<void>;
    pause(): void;
    destroy(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    off(event: string, listener: (...args: unknown[]) => void): void;
  }

  export interface FeatureList {
    mseLivePlayback: boolean;
  }

  const mpegts: {
    createPlayer(
      mediaDataSource: {
        type: string;
        isLive?: boolean;
        url: string;
      },
      config?: Record<string, unknown>,
    ): Player;
    getFeatureList(): FeatureList;
    Events: { ERROR: string };
  };

  export default mpegts;
}
