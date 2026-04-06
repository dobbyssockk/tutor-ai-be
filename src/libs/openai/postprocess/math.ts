export const repairBrokenMath = (text: string) => {
  let output = text;

  const rebalanceBrokenBlockMath = (value: string) =>
    value
      .split("\n")
      .map((line) => {
        const blockDelimiters = line.match(/(?<!\\)\$\$/g)?.length ?? 0;
        if (blockDelimiters === 0 || blockDelimiters % 2 === 0) return line;

        if (/\$\$\s*$/.test(line)) {
          const withoutTail = line.replace(/\s*\$\$\s*$/, "");
          const colonIndex = withoutTail.lastIndexOf(":");
          if (colonIndex >= 0) {
            const prefix = withoutTail.slice(0, colonIndex + 1);
            const expr = withoutTail.slice(colonIndex + 1).trim();
            if (expr) return `${prefix} $$${expr}$$`;
          }
          return `$$${withoutTail.trim()}$$`;
        }

        if (/^\s*\$\$/.test(line)) {
          const body = line.replace(/^\s*\$\$\s*/, "").trim();
          return `$$${body}$$`;
        }

        const colonIndex = line.lastIndexOf(":");
        if (colonIndex >= 0) {
          const prefix = line.slice(0, colonIndex + 1);
          const expr = line.slice(colonIndex + 1).trim();
          if (expr) return `${prefix} $$${expr}$$`;
        }

        return `$$${line.trim()}$$`;
      })
      .join("\n");

  output = output.replace(
    /\[\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\]/g,
    (_, block: string) => `$$${block}$$`
  );
  output = output.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr: string) => {
    return `$$${expr}$$`;
  });
  output = output.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, expr: string) => {
    return `$${expr}$`;
  });

  output = output.replace(
    /(:\s*)([^$\n]*?\\end\{cases\}\$\$)/g,
    (_, prefix: string, body: string) => {
      if (/\\begin\{cases\}/.test(body)) return `${prefix}${body}`;
      return `${prefix}$$\\begin{cases} ${body}`;
    }
  );

  output = output
    .split("\n")
    .map((line) => {
      if (line.includes("\\end{cases}") && !line.includes("\\begin{cases}")) {
        return line.replace(
          /^(.*?:\s*)(.*\\end\{cases\}\$\$.*)$/g,
          "$1$$\\begin{cases} $2"
        );
      }
      return line;
    })
    .join("\n");

  output = rebalanceBrokenBlockMath(output).replace(/\$\$\$\$/g, "$$");

  return output;
};
