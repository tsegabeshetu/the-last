const clients = new Set();

/** Register a Server-Sent Events client and send the current snapshot. */
export function subscribe(req, res, snapshot) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  writeEvent(res, 'snapshot', snapshot);
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function broadcast(event, data) {
  for (const res of clients) {
    try {
      writeEvent(res, event, data);
    } catch {
      clients.delete(res);
    }
  }
}

export function clientCount() {
  return clients.size;
}

const heartbeat = setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clients.delete(res);
    }
  }
}, 25_000);
heartbeat.unref?.();

export function closeAll() {
  for (const res of clients) {
    try {
      res.end();
    } catch {
      // ignore
    }
  }
  clients.clear();
}
