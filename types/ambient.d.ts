declare var process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
  cwd(): string;
  execPath: string;
};

interface Navigator {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
}
