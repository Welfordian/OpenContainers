export function tokenize(commandLine) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  const push = () => {
    if (current !== "") {
      tokens.push(current);
      current = "";
    }
  };

  for (const char of commandLine) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      continue;
    }
    current += char;
  }
  push();
  if (quote) throw new Error(`Unterminated ${quote} quote`);
  return tokens;
}

export function splitCommands(commandLine) {
  const commands = [];
  let current = "";
  let quote = null;
  let escaped = false;

  const push = (operator) => {
    const value = current.trim();
    if (value) commands.push({ command: value, operator });
    current = "";
  };

  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    const next = commandLine[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "&" && next === "&") {
      push("&&");
      index++;
      continue;
    }
    if (char === "|" && next === "|") {
      push("||");
      index++;
      continue;
    }
    if (char === ";") {
      push(";");
      continue;
    }
    current += char;
  }
  push(null);
  return commands;
}

export function parseSimpleCommand(commandLine) {
  const { segments } = parsePipeline(commandLine);
  if (segments.length !== 1) {
    throw new Error("parseSimpleCommand only supports one pipeline segment");
  }
  const tokens = segments[0].tokens;
  const env = {};
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    const [key, ...rest] = tokens[index].split("=");
    env[key] = rest.join("=");
    index++;
  }
  return {
    env,
    command: tokens[index],
    args: tokens.slice(index + 1),
    redirects: segments[0].redirects
  };
}

export function splitPipeline(commandLine) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;

  const push = () => {
    const value = current.trim();
    if (value) segments.push(value);
    current = "";
  };

  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    const next = commandLine[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "|" && next !== "|") {
      push();
      continue;
    }
    current += char;
  }
  push();
  return segments;
}

export function parsePipeline(commandLine) {
  return {
    segments: splitPipeline(commandLine).map(parsePipelineSegment)
  };
}

export function parsePipelineSegment(segment) {
  const tokens = tokenize(segment);
  const redirects = [];
  const args = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if ([">", ">>", "2>", "2>>"].includes(token)) {
      redirects.push({
        fd: token.startsWith("2") ? 2 : 1,
        append: token.endsWith(">>"),
        target: tokens[++index]
      });
      continue;
    }
    if (/^(2?>>|2?>).+/.test(token)) {
      const match = token.match(/^(2?>>|2?>)(.+)$/);
      redirects.push({
        fd: match[1].startsWith("2") ? 2 : 1,
        append: match[1].endsWith(">>"),
        target: match[2]
      });
      continue;
    }
    args.push(token);
  }

  return {
    tokens: args,
    redirects
  };
}
