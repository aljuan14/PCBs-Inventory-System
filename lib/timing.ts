/**
 * Logs how long each step of a request took, e.g.
 * "[import 3f2a…] load 820ms · transform 140ms · existing 95ms · insert 2310ms · total 3365ms".
 */
export function stepTimer(label: string) {
  const start = performance.now();
  let last = start;
  const steps: string[] = [];
  return {
    step(name: string) {
      const now = performance.now();
      steps.push(`${name} ${Math.round(now - last)}ms`);
      last = now;
    },
    done() {
      console.info(`[${label}] ${[...steps, `total ${Math.round(performance.now() - start)}ms`].join(' · ')}`);
    },
  };
}
