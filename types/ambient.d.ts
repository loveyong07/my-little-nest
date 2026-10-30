declare var process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
  cwd(): string;
  execPath: string;
};

declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: "hex"): string };
  };
}

declare var Buffer: {
  from(value: Uint8Array): Uint8Array;
  concat(chunks: Uint8Array[]): { toString(encoding: "utf8"): string };
};

interface Navigator {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
}
