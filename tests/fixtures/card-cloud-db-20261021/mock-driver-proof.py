"""NO SQL: mocked subprocess dispatch proof for the pending lifecycle driver."""
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main, mock
import importlib.util
import subprocess
import tempfile
import os

repo=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('rollback_qa_driver',repo/'tests/db/pending/career_apply_card_cloud_rollback_driver.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reviewed=Path(os.environ['CARD_CLOUD_SOURCE_ROOT']).resolve()
up=reviewed/'supabase/migrations/20261024130000_career_apply_card_cloud_bridge.sql'
down=reviewed/'supabase/rollbacks/20261024130000_career_apply_card_cloud_bridge.sql'

class DispatchProof(TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='rollback-mock-only-');self.addCleanup(self.temp.cleanup)
  self.work=Path(self.temp.name);logs=self.work/'logs';logs.mkdir()
  guard=self.work/'guard.sql';guard.write_text(module.GUARD)
  executable=self.work/'PSQL_MUST_NEVER_EXECUTE';executable.write_text('NOT AN EXECUTABLE; mock intercept is mandatory')
  seed=self.work/'seed.sql';seed.write_text('-- synthetic mock input; never SQL-executed\n')
  self.paths={'psql':executable,'up_sql':up,'down_sql':down,
   'live_source_sql':repo/'tests/fixtures/card-cloud-db-20261021/live014-source.sql',
   'seed_sql':seed,'checkpoints_sql':repo/'tests/db/pending/career_apply_card_cloud_rollback.test.sql'}
  args=SimpleNamespace(dbname='MOCK_ONLY_NO_CONNECTION',host='/tmp/MOCK_ONLY_NO_SOCKET',port=1,
   username='mock_only',scratch_schema='qa_card_cloud_rollback_mock',log_dir=logs,timeout=1)
  self.life=module.Lifecycle(args,self.paths,guard);self.commands=[]
 def capture(self,command,**kwargs):
  self.commands.append(command)
  return subprocess.CompletedProcess(command,0)
 def file_args(self,command):
  return [command[i+1] for i,x in enumerate(command[:-1]) if x=='-f']
 def test_standalone_migration_order_and_preflights(self):
  with mock.patch.object(module.subprocess,'run',side_effect=self.capture):self.life.run()
  production=[(i,c) for i,c in enumerate(self.commands) if self.file_args(c) in [[str(up)],[str(down)]]]
  self.assertEqual([self.file_args(c)[0] for _,c in production],[str(up),str(up),str(down),str(down),str(up)])
  self.assertEqual(len(production),5)
  for i,c in production:
   self.assertEqual(c,self.life.common()+['-f',self.file_args(c)[0]])
   self.assertIn('-X',c);self.assertIn('ON_ERROR_STOP=1',c)
   self.assertNotIn('-1',c);self.assertNotIn('--single-transaction',c);self.assertNotIn('-c',c)
   self.assertTrue(i>0);self.assertEqual(self.file_args(self.commands[i-1]),[str(self.life.guard)])
   self.assertFalse(any('\\i' in x for x in c))
  self.assertEqual(len(self.commands),24)
 def test_changed_input_aborts_before_any_subprocess(self):
  self.paths['seed_sql'].write_text('-- changed synthetic mock input\n')
  with mock.patch.object(module.subprocess,'run',side_effect=self.capture):
   with self.assertRaisesRegex(RuntimeError,'input changed'):self.life.run()
  self.assertEqual(self.commands,[])
 def test_failed_checkpoint_prevents_next_migration(self):
  def fail_up1(command,**kwargs):
   self.commands.append(command)
   failed='bridge_stage=up1' in command and self.file_args(command)[-1]==str(self.paths['checkpoints_sql'])
   return subprocess.CompletedProcess(command,1 if failed else 0)
  with mock.patch.object(module.subprocess,'run',side_effect=fail_up1):
   with self.assertRaisesRegex(RuntimeError,'checkpoint-up1'):self.life.run()
  self.assertEqual([self.file_args(c)[0] for c in self.commands if self.file_args(c) in [[str(up)],[str(down)]]],[str(up)])
  self.assertFalse(any('up-two'==r['label'] for r in self.life.records))

if __name__=='__main__':main(verbosity=2)
