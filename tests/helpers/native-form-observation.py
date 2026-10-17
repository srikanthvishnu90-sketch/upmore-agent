#!/usr/bin/env python3
"""STATIC modeled fixture inspection only: not a browser DOM or employer capture."""
import json
import sys
from html.parser import HTMLParser
from pathlib import Path

class Model(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields, self.labels, self.current_label = [], {}, None
        self.select, self.option = None, None

    def handle_starttag(self, tag, pairs):
        a = dict(pairs)
        if tag == 'label':
            self.current_label = a.get('for')
            self.labels[self.current_label] = ''
        if tag in ('input', 'select', 'textarea'):
            field = dict(selector='#' + a.get('id', ''), name=a.get('name', ''),
                         id=a.get('id', ''), inputType=a.get('type', tag),
                         required='required' in a, disabled='disabled' in a,
                         readOnly='readonly' in a, ref='static-fixture-' + str(len(self.fields)))
            self.fields.append(field)
            if tag == 'select':
                self.select = field
                self.select['options'] = []
        if tag == 'option' and self.select is not None:
            self.option = {'value': a.get('value', ''), 'label': ''}
            self.select['options'].append(self.option)

    def handle_endtag(self, tag):
        if tag == 'label':
            self.current_label = None
        if tag == 'option':
            self.option = None
        if tag == 'select':
            self.select = None

    def handle_data(self, data):
        if self.current_label is not None:
            self.labels[self.current_label] += data
        if self.option is not None:
            self.option['label'] += data

model = Model()
model.feed(Path(sys.argv[1]).read_text())
for field in model.fields:
    field['label'] = ' '.join(model.labels.get(field['id'], '').split())
print(json.dumps({'provenance': 'STATIC_MODELED_FIXTURE_NOT_BROWSER', 'fields': model.fields}))
