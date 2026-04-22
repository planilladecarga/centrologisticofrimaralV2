/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'z-ai-web-dev-sdk' {
  interface ZAIInstance {
    chat: {
      completions: {
        create(params: any): Promise<{ choices: Array<{ message: { content: string } }> }>;
      };
    };
    images?: {
      generations: {
        create(params: any): Promise<{ data: Array<{ base64: string }> }>;
      };
    };
    functions?: {
      invoke(name: string, params: any): Promise<any>;
    };
  }

  export default class ZAI {
    static create(): Promise<ZAIInstance>;
  }
}
