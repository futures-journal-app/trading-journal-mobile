"""Trading Journal Mobile JSON -> existing Windows SQLite. Python 3.10+; no external dependencies.
Usage: python import_mobile.py path/to/TradingJournal_Mobile_YYYY-MM-DD.json
Use --dry-run to validate without changing the database.
"""
import argparse, json, sqlite3, uuid
from pathlib import Path
from datetime import datetime
from decimal import Decimal

DB=Path.home()/'Documents'/'TradingJournal'/'journal.sqlite3'
BACKUPS=DB.parent/'backups'
POINT={'MNQ':Decimal('2'),'NQ':Decimal('20')}

def validate(data):
    if data.get('format')!='trading-journal-mobile' or data.get('schema_version')!=1:
        raise ValueError('Unsupported mobile export format/version')
    trades=data.get('trades');exits=data.get('exits')
    if not isinstance(trades,list) or not isinstance(exits,list):raise ValueError('Missing trade/exit lists')
    ids=set();exids=set();trade_by_id={}
    for t in trades:
        if t['id'] in ids:raise ValueError('Duplicate trade ID in JSON')
        ids.add(t['id']);trade_by_id[t['id']]=t
        if t['instrument'] not in POINT or t['direction'] not in ('Long','Short') or not 1<=int(t['contracts'])<=10:raise ValueError('Invalid trade instrument/direction/qty')
        if Decimal(t['entry_price'])<=0 or (Decimal(t['entry_price'])*4)%1:raise ValueError('Invalid entry price/tick')
        datetime.fromisoformat(t['entry_time'])
    closed={}
    for e in exits:
        if e['id'] in exids:raise ValueError('Duplicate exit ID in JSON')
        exids.add(e['id']);tid=e['trade_id']
        if tid not in trade_by_id:raise ValueError('Exit references a missing trade')
        q=int(e['contracts']);closed[tid]=closed.get(tid,0)+q
        if q<1 or closed[tid]>int(trade_by_id[tid]['contracts']):raise ValueError('Over-closed position')
        if Decimal(e['exit_price'])<=0 or (Decimal(e['exit_price'])*4)%1:raise ValueError('Invalid exit price/tick')
        datetime.fromisoformat(e['exit_time'])
        if e['exit_time']<trade_by_id[tid]['entry_time']:raise ValueError('Exit precedes entry')
        if (e.get('fx_eur_per_usd') is None)!=(not bool(e.get('fx_source'))):raise ValueError('FX rate and source must both be present or absent')
        if e.get('fx_eur_per_usd') is not None and Decimal(e['fx_eur_per_usd'])<=0:raise ValueError('Invalid FX')
    return trades,exits

def main():
    p=argparse.ArgumentParser();p.add_argument('json_file',type=Path);p.add_argument('--dry-run',action='store_true');args=p.parse_args()
    data=json.loads(args.json_file.read_text(encoding='utf-8'));trades,exits=validate(data)
    if not DB.exists():raise SystemExit(f'Windows journal database not found: {DB}')
    conn=sqlite3.connect(DB);conn.row_factory=sqlite3.Row;conn.execute('PRAGMA foreign_keys=ON');conn.execute('PRAGMA busy_timeout=5000')
    try:
        trade_cols={r[1] for r in conn.execute('PRAGMA table_info(trades)')};exit_cols={r[1] for r in conn.execute('PRAGMA table_info(exits)')}
        if not {'session','entry_time_precision'}.issubset(trade_cols):raise ValueError('Windows DB schema too old; run Trading Journal v1.0.3.8 first')
        if not {'fx_eur_per_usd','fx_source'}.issubset(exit_cols):raise ValueError('Unexpected exits schema')
        existing_trades={r['id']:r for r in conn.execute('SELECT * FROM trades')};existing_exits={r['id']:r for r in conn.execute('SELECT * FROM exits')}
        new_t=[];new_e=[];pending=[]
        for t in trades:
            if t['id'] not in existing_trades:new_t.append(t)
            else:
                old=existing_trades[t['id']]
                for key in ('instrument','direction','contracts','entry_price','entry_time'):
                    if str(old[key])!=str(t[key]):raise ValueError(f'Existing trade {t["id"]} differs in {key}; resolve manually')
        for e in exits:
            if e['id'] in existing_exits:
                old=existing_exits[e['id']]
                for key in ('trade_id','contracts','exit_price','exit_time'):
                    if str(old[key])!=str(e[key]):raise ValueError(f'Existing exit {e["id"]} differs in {key}; resolve manually')
            elif e.get('fx_eur_per_usd') is None:pending.append(e)
            else:new_e.append(e)
        print(f'Treidejä tiedostossa: {len(trades)}; uusia: {len(new_t)}')
        print(f'Sulkemisia tiedostossa: {len(exits)}; uusia kurssillisia: {len(new_e)}; odottaa FX-tietoja: {len(pending)}')
        if pending:
            print('HUOM: Puuttuvan FX-kurssin sulkemisia EI tuoda. Täydennä ne ensin puhelimessa tai erillisessä tarkistusvaiheessa.')
        if args.dry_run:print('Dry run: tietokantaa ei muutettu.');return
        BACKUPS.mkdir(parents=True,exist_ok=True)
        backup=BACKUPS/('before_mobile_import_'+datetime.now().strftime('%Y%m%d_%H%M%S_%f')+'.sqlite3')
        dst=sqlite3.connect(backup)
        try:conn.backup(dst)
        finally:dst.close()
        now=datetime.now().astimezone().isoformat(timespec='seconds')
        with conn:
            for t in new_t:
                keys=['id','instrument','direction','contracts','entry_price','entry_time','recorded_at','timeframe','confluence','setup','stop_pts','notes','status','finalized_at','updated_at','session','entry_time_precision']
                vals=[t.get(k) for k in keys];vals[keys.index('status')]='Open';vals[keys.index('finalized_at')]=None
                conn.execute('INSERT INTO trades ('+','.join(keys)+') VALUES ('+','.join('?'*len(keys))+')',vals)
                conn.execute('INSERT INTO audit(trade_id,event,payload,at) VALUES(?,?,?,?)',(t['id'],'MOBILE_IMPORT_TRADE',json.dumps(t,ensure_ascii=False),now))
            for e in new_e:
                keys=['id','trade_id','contracts','exit_price','exit_time','fx_eur_per_usd','fx_source','created_at']
                conn.execute('INSERT INTO exits ('+','.join(keys)+') VALUES ('+','.join('?'*len(keys))+')',[e.get(k) for k in keys])
                conn.execute('INSERT INTO audit(trade_id,event,payload,at) VALUES(?,?,?,?)',(e['trade_id'],'MOBILE_IMPORT_EXIT',json.dumps(e,ensure_ascii=False),now))
            for tid in {t['id'] for t in new_t}|{e['trade_id'] for e in new_e}:
                total=conn.execute('SELECT contracts FROM trades WHERE id=?',(tid,)).fetchone()['contracts']
                closed=conn.execute('SELECT COALESCE(SUM(contracts),0) AS n FROM exits WHERE trade_id=?',(tid,)).fetchone()['n']
                if closed>total:raise ValueError('Imported exits over-close an existing trade; rolled back')
                status='Closed' if closed==total else 'Partially Closed' if closed else 'Open'
                conn.execute('UPDATE trades SET status=?,updated_at=? WHERE id=?',(status,now,tid))
        print('Tuonti onnistui. Varmuuskopio:',backup)
    finally:conn.close()
if __name__=='__main__':main()
