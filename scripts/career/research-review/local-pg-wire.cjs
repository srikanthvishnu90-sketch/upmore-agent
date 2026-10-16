'use strict';
// Test-only loopback TCP transport into the existing network-none fixture.
// No published Docker port, host networking, remote DB or credential lookup.
const net=require('node:net'),fs=require('node:fs'),{spawn,execFileSync}=require('node:child_process');
const [container,readyFile]=process.argv.slice(2);
if(!/^upmore-career-integration-pg-[a-z0-9-]+$/.test(container||'')||!readyFile)throw Error('Explicit local fixture and ready file required');
if(execFileSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}}',container],{encoding:'utf8'}).trim()!=='none')throw Error('Network-none fixture required');
const sockets=new Set(),children=new Set();let connections=0;
const server=net.createServer(socket=>{sockets.add(socket);connections++;socket.pause();
 const forward=`use IO::Socket::INET;use IO::Select;
my $s=IO::Socket::INET->new(PeerAddr=>'127.0.0.1',PeerPort=>5432,Proto=>'tcp') or die $!;
binmode STDIN;binmode STDOUT;my $sel=IO::Select->new(\\*STDIN,$s);
while(1){for my $f($sel->can_read){my $n=sysread($f,my $b,65536);die $! unless defined $n;
if(!$n){if(fileno($f)==fileno(STDIN)){shutdown($s,1);$sel->remove(\\*STDIN);}else{exit 0;}}
else{my $out=fileno($f)==fileno(STDIN)?$s:\\*STDOUT;while(length($b)){my $written=syswrite($out,$b);die $! unless $written;substr($b,0,$written,'');}}}}`;
 const child=spawn('docker',['exec','-i',container,'perl','-e',forward],{stdio:['pipe','pipe','pipe']});children.add(child);
 child.stderr.on('data',b=>process.stderr.write(b));child.on('error',e=>socket.destroy(e));socket.on('error',()=>{});child.stdin.on('error',()=>{});child.stdout.on('error',()=>{});
 child.stdout.pipe(socket);socket.pipe(child.stdin);socket.resume();
 socket.on('close',()=>{sockets.delete(socket);child.stdin.end();});child.on('close',()=>{children.delete(child);socket.destroy();});
});
server.listen(0,'127.0.0.1',()=>{const info={container,host:'127.0.0.1',port:server.address().port,network:'none',pid:process.pid,transport:'docker exec Perl IO::Select loopback TCP stdio',at:new Date().toISOString()};fs.writeFileSync(readyFile,JSON.stringify(info,null,2)+'\n');console.log(JSON.stringify(info));});
function close(){server.close();for(const socket of sockets)socket.destroy();for(const child of children)child.stdin.end();console.log(JSON.stringify({closed:true,connections}));}
process.once('SIGTERM',close);process.once('SIGINT',close);
