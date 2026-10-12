"""Reproducible runtime build and real local Deno dependency checks (no network)."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/build-agent-runtime.py'
spec = importlib.util.spec_from_file_location('agent_runtime_builder', SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class RuntimeBuild(unittest.TestCase):
    def run_builder(self, root, *options):
        return subprocess.run([sys.executable, str(SCRIPT), '--root', str(root), *options],
                              capture_output=True, text=True, check=False)

    def isolated(self, root):
        inputs = [Path('packages/domain') / name for name, _ in builder.MODULES]
        inputs += [Path('packages/capabilities/registry.js'), Path('packages/capabilities/registry.json')]
        for path in inputs:
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
        return inputs

    def test_generated_bytes_match_exact_inputs_and_registry(self):
        expected, digest = builder.build(ROOT)
        self.assertEqual((ROOT / builder.OUTPUT).read_bytes(), expected)
        self.assertIn(digest.encode(), expected)
        result = self.run_builder(ROOT, '--check')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_isolated_source_change_is_detected_without_rewriting_bundle_or_original(self):
        source = ROOT / 'packages/domain/43-agent-loop.js'
        original = source.read_bytes()
        with tempfile.TemporaryDirectory(prefix='upmore-runtime-build-') as temp:
            root = Path(temp)
            self.isolated(root)
            self.assertEqual(self.run_builder(root).returncode, 0)
            before = (root / builder.OUTPUT).read_bytes()
            copied = root / 'packages/domain/43-agent-loop.js'
            copied.write_bytes(copied.read_bytes() + b'\n// isolated source drift probe\n')
            result = self.run_builder(root, '--check')
            self.assertEqual(result.returncode, 1)
            self.assertIn('stale', result.stderr)
            self.assertEqual((root / builder.OUTPUT).read_bytes(), before)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(self.run_builder(root).returncode, 0)
            self.assertNotEqual((root / builder.OUTPUT).read_bytes(), before)
            self.assertEqual(self.run_builder(root, '--check').returncode, 0)

    def test_registry_drift_and_missing_dependency_fail_without_touching_current_artifact(self):
        with tempfile.TemporaryDirectory(prefix='upmore-runtime-registry-') as temp:
            root = Path(temp)
            self.isolated(root)
            self.assertEqual(self.run_builder(root).returncode, 0)
            before = (root / builder.OUTPUT).read_bytes()
            registry = root / 'packages/capabilities/registry.json'
            data = json.loads(registry.read_text())
            data['isolated_drift_probe'] = True
            registry.write_text(json.dumps(data))
            self.assertEqual(self.run_builder(root, '--check').returncode, 1)
            self.assertEqual((root / builder.OUTPUT).read_bytes(), before)
            (root / 'packages/domain/48-money-math.js').unlink()
            result = self.run_builder(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Runtime build failed', result.stderr)
            self.assertEqual((root / builder.OUTPUT).read_bytes(), before)

    def test_repeated_builds_are_identical_across_different_fixture_roots(self):
        with tempfile.TemporaryDirectory(prefix='upmore-runtime-a-') as a, tempfile.TemporaryDirectory(prefix='upmore-runtime-b-') as b:
            for directory in [a, b]:
                root = Path(directory)
                self.isolated(root)
                self.assertEqual(self.run_builder(root).returncode, 0)
                before = (root / builder.OUTPUT).read_bytes()
                self.assertEqual(self.run_builder(root).returncode, 0)
                self.assertEqual((root / builder.OUTPUT).read_bytes(), before)
            self.assertEqual((Path(a) / builder.OUTPUT).read_bytes(), (Path(b) / builder.OUTPUT).read_bytes())

    def test_actual_deno_import_resolves_shared_lexical_dependencies_and_keeps_statuses(self):
        self.assertIsNotNone(shutil.which('deno'), 'Deno is required for runtime verification')
        script = '''
import * as r from SOURCE;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const names=NAMES;
for(const name of names)assert(r[name] && typeof r[name]==='object','Missing '+name);
assert(typeof r.AgentLoop.create==='function' && typeof r.AgentMoneyPlans.ownTransfer==='function','Loop/plans exports');
const now=1791633600000;
const send=r.AgentMoney.prepareSend({amount_cents:100,recipient:'Known'},
 {today:'2026-10-10',people:[{id:'synthetic',name:'Known',rails:['venmo'],history:[{}]}]});
assert(send.amount_cents===100 && send.rail.mode==='handoff','MoneyMath shared scope/NOT_WIRED rail reality');
const feed=r.AgentProactive.feed({today:'2026-10-10',transactions:[],accounts:[],isLive:false},{now});
for(const engine of ['monitors','save','earn','alerts'])assert(feed.sources[engine], 'Missing feed dependency '+engine);
const control=r.AgentControl.create();control.pause.set('synthetic check',now);
assert(control.pause.gate({tier:'T3'},now).allowed===false,'Pause dependency');
const registry=r.CapabilityRegistry.load(r.RuntimeRegistryData);
assert(registry.size===r.RuntimeRegistryData.capabilities.length,'Registry snapshot');
for(const cap of r.RuntimeRegistryData.capabilities)assert(registry.get(cap.id).status===cap.status,'Status override');
const original=r.RuntimeRegistryData.capabilities[0].status;
try{r.RuntimeRegistryData.capabilities[0].status='VERIFIED';}catch{}
assert(r.RuntimeRegistryData.capabilities[0].status===original,'Registry snapshot mutable');
assert(/^[a-f0-9]{64}$/.test(r.RuntimeSourceHash),'Missing source digest');
console.log('PASS: real Deno runtime dependencies, status preservation and immutable registry snapshot');
'''.replace('SOURCE', json.dumps((ROOT / builder.OUTPUT).as_uri())).replace('NAMES', json.dumps([name for _, name in builder.MODULES] + ['CapabilityRegistry']))
        result = subprocess.run(['deno', 'eval', script], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('PASS: real Deno runtime', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
