export function d1() {
  return {
    prepare() {
      throw new Error("D1 should not be used by these boundary tests");
    },
  };
}
