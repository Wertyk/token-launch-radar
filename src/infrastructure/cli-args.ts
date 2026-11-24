interface CliArgs {
  input: string;
  output: string;
  assets: string;
}

export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  defaultAssets: string,
): CliArgs {
  const args: CliArgs = {
    input: "/input",
    output: env.MAKEFUN_OUTPUT_DIR || "/output",
    assets: defaultAssets,
  };

  const tokens = argv[Symbol.iterator]();
  for (const token of tokens) {
    const equals = token.indexOf("=");
    const flag = equals < 0 ? token : token.slice(0, equals);
    const option = flag.slice(2);
    if (
      !flag.startsWith("--") ||
      (option !== "input" && option !== "output" && option !== "assets")
    ) {
      throw new Error(`Unknown argument ${flag}`);
    }

    const path = equals < 0 ? tokens.next().value : token.slice(equals + 1);
    if (!path || (equals < 0 && path.startsWith("--"))) {
      throw new Error(`${flag} requires a path`);
    }
    args[option] = path;
  }

  return args;
}
