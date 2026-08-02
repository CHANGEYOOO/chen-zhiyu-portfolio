export function r2() {
  return {
    get() {
      throw new Error("R2 should not be used by these boundary tests");
    },
  };
}
