
    import { performance } from 'perf_hooks';
    console.log('Starting...');
    const start = performance.now();
    try {
      require('./core/types');
      console.log('types loaded in', (performance.now() - start).toFixed(2), 'ms');
    } catch(e) {
      console.log('Error:', e.message);
    }
    console.log('Done');
    