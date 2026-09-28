#!/usr/bin/env python3
"""Audit fixes for qa/discovery/rejects-g45.txt (G45 lane)."""
import io, sys

p = '/home/hatch/workspace/upmore/qa/discovery/rejects-g45.txt'
s = io.open(p, encoding='utf-8').read()

fixes = [
    # R4922: wrong-county URL -> blank (blank is honest; Saluda URL documents nothing about York)
    ('R4922|York County SC poll manager|2026-09-23T05:13:18Z|https://saludacounty.sc.gov/sites/saludacounty/files/Documents/Pollworker.pdf|',
     'R4922|York County SC poll manager|2026-09-23T05:13:18Z||'),
    # R4937: drop historical claim the bill URL does not document; keep core claim, blank URL
    ('R4937|Southeastern Connecticut Planning Region CT|2026-09-23T05:26:12Z|https://cga.ct.gov/2026/TOB/S/PDF/2026SB-00464-R00-SB.PDF|reject: CT county governments were abolished in 1960 and the Southeastern Connecticut Planning Region is a census statistical planning region, not a county election authority; CT poll workers are hired and paid by municipal registrars of voters, and no official region-level compensation schedule or work hours is published',
     'R4937|Southeastern Connecticut Planning Region CT|2026-09-23T05:26:12Z||reject: the Southeastern Connecticut Planning Region is a census statistical planning region, not a county election authority; CT poll workers are hired and paid by municipal registrars of voters, and no official region-level compensation schedule or work hours is published'),
    # R4942: soften invented publication status
    ('while the county own 2026 poll worker recruitment release states a lump sum',
     'while a 2026 poll worker recruitment release states a lump sum'),
    # R4953: soften absolute language
    ('and no official worker shift hours are published anywhere',
     'and no county-published worker shift hours were found'),
    # R4956: normalize host capitalization (host is case-insensitive)
    ('https://Www.Eac.Gov/sites/default/files/clearinghouseawards/2020/Harris_County_Poll_Worker.pdf',
     'https://www.eac.gov/sites/default/files/clearinghouseawards/2020/Harris_County_Poll_Worker.pdf'),
]
for old, new in fixes:
    if old not in s:
        print('NOT FOUND:', old[:70], file=sys.stderr)
        sys.exit(1)
    s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(s)
print('audit fixes applied: %d' % len(fixes))
