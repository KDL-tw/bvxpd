"""Adapter failure cases; run with python3 -m unittest discover -s tests -p 'test_*.py'."""
import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('ingest', Path(__file__).parents[1] / 'scripts/ingest-co-2022.py')
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)

class AdapterTests(unittest.TestCase):
    def table(self):
        return {'heading':'District 8','rows':[
            ['County','Registered voters','Ballots cast','A (DEM)','B (REP) (Write-in)','Total','Turnout %'],
            ['Adams','10','5','3','2','5','50%'],
            ['Total','10','5','3','2','5','50%']]}
    def convert(self, table):
        return ingest.convert_table(table, {'file':'fixture','url':'fixture','sha256':'fixture'})
    def test_preserves_zero_and_ignores_turnout(self):
        records, check = self.convert(self.table())
        self.assertEqual(len(records),2)
        self.assertEqual(check['totalVotes'],5)
        self.assertEqual(records[1]['candidate'],'B (Write-in)')
    def test_row_total_mismatch_rejected(self):
        table=self.table();table['rows'][1][-2]='6'
        with self.assertRaisesRegex(ValueError,'row total'):self.convert(table)
    def test_candidate_column_mismatch_rejected(self):
        table=self.table();table['rows'][-1][3:5]=['2','3']
        with self.assertRaisesRegex(ValueError,'candidate totals'):self.convert(table)
    def test_duplicate_county_rejected(self):
        table=self.table();table['rows'].insert(2,list(table['rows'][1]))
        with self.assertRaisesRegex(ValueError,'duplicate'):self.convert(table)
    def test_blank_is_not_zero(self):
        table=self.table();table['rows'][1][3]=''
        with self.assertRaisesRegex(ValueError,'Invalid count'):self.convert(table)

if __name__=='__main__':unittest.main()
