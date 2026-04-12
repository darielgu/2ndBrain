declare module '@vladmandic/human/dist/human.esm' {
  export class Human {
    constructor(config?: unknown)
    load(): Promise<void>
    warmup(): Promise<void>
    detect(input: HTMLVideoElement): Promise<{ face?: Array<{ embedding?: number[] }> }>
  }
}

declare module '@vladmandic/human/dist/human.esm.js' {
  export * from '@vladmandic/human/dist/human.esm'
}
