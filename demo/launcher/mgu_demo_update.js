'use strict';
/**
 * mgu_demo_update.js - the MGU demo's launcher (mgu_demo.bat runs it): fetches the newest code of the repositories
 * (myapp-id7, myapp-cluster and, when they can be fetched, myapp-cluster-high, myapp-comfort and 재민's apps) into src\ before the demo starts, so the demo always shows the apps as they are on GitHub now. Only Node is needed
 * (git when it is there; otherwise the branch's tarball from GitHub, unpacked with tar, which Windows 10 and later have).
 *
 *   node mgu_demo_update.js            (APPS_BRANCH / CLUSTER_BRANCH / STYLES_BRANCH / COMFORT_BRANCH / JM_BRANCH: the branches; defaults below)
 *
 * A repository that is already the newest is left as it is; with no internet the code there is used as it is.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const SRC = path.join(HERE, 'src');
const REPOS = [
    { name: 'myapp-id7', repo: 'akakingj/myapp-id7', branch: process.env.APPS_BRANCH || 'test' },
    { name: 'myapp-cluster', repo: 'akakingj/myapp-cluster', branch: process.env.CLUSTER_BRANCH || 'test' },
    // MGU Styles: shown when it can be fetched; while the repository is private, a git clone in src\ (made with a GitHub login) is updated with git pull
    // (its work branch is test; an older mgu_demo.bat still says ak, the branch's former name)
    { name: 'myapp-cluster-high', repo: 'akakingj/myapp-cluster-high', branch: process.env.STYLES_BRANCH && process.env.STYLES_BRANCH !== 'ak' ? process.env.STYLES_BRANCH : 'test', optional: true },
    // myapp-comfort (IterioDev's apps, the owner's copy: Seats, Ambient Light, Turn View, Drive Recorder, Tailscale on
    // iDrive 7; demo 1.14.0): its packages run on the centre display; the demo runs without it when it can't be fetched
    { name: 'myapp-comfort', repo: 'akakingj/myapp-comfort', branch: process.env.COMFORT_BRANCH || 'test', optional: true },
    // 재민's apps (jaimeen77-cmyk/apps, MIT; demo 1.14.0): built by its own tools/store-build.js and run on the centre display
    { name: 'jm-apps', repo: 'jaimeen77-cmyk/apps', branch: process.env.JM_BRANCH || 'main', optional: true },
];
const say = (s) => console.log(s);

function get(url, asJson, hops) {
    return new Promise((res, rej) => {
        const rq = https.get(url, { headers: { 'User-Agent': 'mgu-demo', Accept: asJson ? 'application/vnd.github+json' : '*/*' }, timeout: 30000 }, (r) => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && (hops || 0) < 5) { r.resume(); res(get(new URL(r.headers.location, url).toString(), asJson, (hops || 0) + 1)); return; }
            if (r.statusCode !== 200) { r.resume(); rej(new Error('HTTP ' + r.statusCode + ' ' + url)); return; }
            const parts = [];
            r.on('data', (d) => parts.push(d));
            r.on('end', () => { const b = Buffer.concat(parts); if (!asJson) { res(b); return; } try { res(JSON.parse(b.toString('utf8'))); } catch (e) { rej(e); } });
            r.on('error', rej);
        });
        rq.on('timeout', () => rq.destroy(new Error('timeout')));
        rq.on('error', rej);
    });
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const hasGit = () => { try { return spawnSync('git', ['--version'], { windowsHide: true }).status === 0; } catch (e) { return false; } };

async function update(r) {
    const dir = path.join(SRC, r.name), mark = path.join(dir, '.demo-source.json');
    // a clone made by hand: git pull
    if (fs.existsSync(path.join(dir, '.git')) && hasGit()) {
        // on the branch asked for (a clone of another branch: fetched and switched to it, local changes kept or refused)
        const cur = spawnSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', windowsHide: true });
        if (cur.status === 0 && cur.stdout.trim() !== r.branch) {
            say('  ' + r.name + ': ' + r.branch + ' 브랜치로');
            spawnSync('git', ['-C', dir, 'fetch', 'origin', r.branch], { stdio: 'inherit', windowsHide: true });
            const co = spawnSync('git', ['-C', dir, 'checkout', r.branch], { stdio: 'inherit', windowsHide: true });
            if (co.status !== 0) say('  ' + r.name + ': ' + r.branch + ' 브랜치로 바꾸지 못했습니다 - 지금 브랜치로 실행합니다');
        }
        say('  ' + r.name + ': git pull');
        const p = spawnSync('git', ['-C', dir, 'pull', '--ff-only'], { stdio: 'inherit', windowsHide: true });
        if (p.status !== 0) say('  ' + r.name + ': git pull 실패 - 지금 있는 코드로 실행합니다');
        return;
    }
    let info = null;
    try { info = await get('https://api.github.com/repos/' + r.repo + '/commits/' + encodeURIComponent(r.branch), true); } catch (e) { /* rate limit or offline: the tarball by branch */ }
    const local = readJson(mark);
    if (info && local && local.sha === info.sha && fs.existsSync(path.join(dir, 'apps'))) {
        say('  ' + r.name + ' (' + r.branch + '): 최신 ' + info.sha.slice(0, 7));
        return;
    }
    const ref = info ? info.sha : 'refs/heads/' + r.branch;
    say('  ' + r.name + ' (' + r.branch + '): 받는 중' + (info ? ' ' + info.sha.slice(0, 7) : '') + ' ...');
    let tgz;
    try { tgz = await get('https://codeload.github.com/' + r.repo + '/tar.gz/' + ref); } catch (e) {
        // (1.14.0) not as a download (a repository that needs a GitHub login): a git clone, once - git asks for the
        // login (Git for Windows: a browser window) and remembers it; from then on it is updated with git pull above
        if (!fs.existsSync(path.join(dir, 'apps')) && hasGit()) {
            say('  ' + r.name + ': git clone (GitHub 로그인 창이 뜨면 로그인하세요) ...');
            const tmp = path.join(SRC, '.clone-' + r.name);
            fs.rmSync(tmp, { recursive: true, force: true });
            const c = spawnSync('git', ['clone', '--depth', '1', '--branch', r.branch, 'https://github.com/' + r.repo + '.git', tmp], { stdio: 'inherit', windowsHide: true });
            if (c.status === 0) { fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir); say('  ' + r.name + ': 받음 (git)'); return; }
            fs.rmSync(tmp, { recursive: true, force: true });
        }
        say('  ' + r.name + ': 받지 못했습니다 (' + e.message + ')' + (fs.existsSync(dir) ? ' - 지금 있는 코드로 실행합니다' : r.optional ? ' - 이 앱 없이 실행합니다' : ''));
        return;
    }
    const tmp = fs.mkdtempSync(path.join(SRC, '.new-'));
    const file = path.join(tmp, 'src.tar.gz');
    fs.writeFileSync(file, tgz);
    const t = spawnSync('tar', ['-xzf', 'src.tar.gz'], { cwd: tmp, windowsHide: true, encoding: 'utf8' });
    const top = fs.readdirSync(tmp).filter((d) => d !== 'src.tar.gz' && fs.statSync(path.join(tmp, d)).isDirectory());
    if (t.status !== 0 || top.length !== 1) {
        say('  ' + r.name + ': 압축을 풀지 못했습니다 (' + String(t.stderr || t.error || '').trim().slice(0, 200) + ')');
        fs.rmSync(tmp, { recursive: true, force: true });
        return;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, top[0]), dir);
    fs.rmSync(tmp, { recursive: true, force: true });
    const c = info && info.commit;
    fs.writeFileSync(mark, JSON.stringify({ branch: r.branch, sha: info ? info.sha : '', commit: info ? info.sha.slice(0, 7) : '', date: c && c.committer ? String(c.committer.date).slice(0, 16).replace('T', ' ') : '',
        message: c ? String(c.message).split('\n')[0].slice(0, 120) : '', fetched: new Date().toISOString() }, null, 1));
    say('  ' + r.name + ': ' + (c ? String(c.message).split('\n')[0].slice(0, 80) : '받음'));
}

(async () => {
    fs.mkdirSync(SRC, { recursive: true });
    say('최신 코드 확인 (GitHub)');
    for (const r of REPOS) { try { await update(r); } catch (e) { say('  ' + r.name + ': ' + e.message); } }
    // this launcher itself as myapp-id7 has it now (a new repository or branch reaches the PC without a new zip; from the next start)
    try {
        const mine = path.join(SRC, 'myapp-id7', 'demo', 'launcher', 'mgu_demo_update.js');
        const next = fs.readFileSync(mine, 'utf8');
        if (next.indexOf('mgu_demo_update.js') > 0 && next !== fs.readFileSync(__filename, 'utf8')) {
            fs.writeFileSync(__filename, next);
            say('  런처(mgu_demo_update.js)를 새 버전으로 바꿨습니다');
            // (1.14.0: the new launcher runs at once, once - a repository it adds comes with this start, not the next)
            if (!process.env.MGU_DEMO_RELAUNCHED) {
                spawnSync(process.execPath, [__filename], { stdio: 'inherit', windowsHide: true, env: Object.assign({}, process.env, { MGU_DEMO_RELAUNCHED: '1' }) });
                return;
            }
        }
    } catch (e) { /* as it is */ }
    // Python 3 builds myapp-id7's apps (kit/tools/build.py), as the MGU Store does
    const py = (process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3']]).some(([c, ...a]) => {
        try { const p = spawnSync(c, a.concat(['-c', 'import sys; print(sys.version_info[0])']), { encoding: 'utf8', windowsHide: true }); return p.status === 0 && p.stdout.trim() === '3'; } catch (e) { return false; }
    });
    if (!py) say('\n[!] Python 3가 없습니다: myapp-id7 앱(차량 프로필, 레드라인 등)은 빌드되지 않습니다.\n    python.org 에서 설치하면서 "Add python.exe to PATH"를 체크하세요. (계기판 앱은 Python 없이도 됩니다)\n');
})();
