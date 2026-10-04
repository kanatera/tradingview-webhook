// unit-tests.ts
import { isTimeInRange, rangesOverlap } from './src/lib/schedule';
import { extractAlertText } from './src/lib/alert-text';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error('FAILED:', message);
        process.exit(1);
    }
    console.log('PASSED:', message);
}

console.log('--- Starting Unit Tests ---');

// 1. isTimeInRange
console.log('\n1. Testing isTimeInRange...');
assert(isTimeInRange('10:00', '08:00', '12:00') === true, '10:00 is in 08:00-12:00');
assert(isTimeInRange('07:59', '08:00', '12:00') === false, '07:59 is NOT in 08:00-12:00');
assert(isTimeInRange('12:00', '08:00', '12:00') === false, '12:00 is NOT in 08:00-12:00 (exclusive end)');
assert(isTimeInRange('08:00', '08:00', '12:00') === true, '08:00 is in 08:00-12:00 (inclusive start)');

// Overnight isTimeInRange
assert(isTimeInRange('23:00', '22:00', '06:00') === true, '23:00 is in 22:00-06:00 (overnight)');
assert(isTimeInRange('05:00', '22:00', '06:00') === true, '05:00 is in 22:00-06:00 (overnight)');
assert(isTimeInRange('10:00', '22:00', '06:00') === false, '10:00 is NOT in 22:00-06:00 (overnight)');
assert(isTimeInRange('22:00', '22:00', '06:00') === true, '22:00 is in 22:00-06:00 (overnight, inclusive start)');
assert(isTimeInRange('06:00', '22:00', '06:00') === false, '06:00 is NOT in 22:00-06:00 (overnight, exclusive end)');

// 2. rangesOverlap
console.log('\n2. Testing rangesOverlap...');
// Normal ranges
assert(rangesOverlap('08:00', '10:00', '09:00', '11:00') === true, '08-10 and 09-11 overlap');
assert(rangesOverlap('08:00', '09:00', '09:00', '10:00') === false, '08-09 and 09-10 do NOT overlap (touching)');
assert(rangesOverlap('08:00', '10:00', '11:00', '12:00') === false, '08-10 and 11-12 do NOT overlap');
assert(rangesOverlap('08:00', '12:00', '09:00', '10:00') === true, '08-12 and 09-10 overlap (contained)');

// Overnight ranges
assert(rangesOverlap('22:00', '02:00', '23:00', '01:00') === true, '22-02 and 23-01 overlap (overnight contained)');
assert(rangesOverlap('22:00', '02:00', '01:00', '03:00') === true, '22-02 and 01-03 overlap (overnight trailing)');
assert(rangesOverlap('22:00', '02:00', '21:00', '23:00') === true, '22-02 and 21-23 overlap (overnight leading)');
assert(rangesOverlap('22:00', '02:00', '03:00', '04:00') === false, '22-02 and 03-04 do NOT overlap');
assert(rangesOverlap('22:00', '02:00', '20:00', '21:00') === false, '22-02 and 20-21 do NOT overlap');

// Mixed ranges
assert(rangesOverlap('22:00', '02:00', '01:00', '03:00') === true, 'Overnight 22-02 and Normal 01-03 overlap');
assert(rangesOverlap('23:00', '01:00', '00:00', '00:30') === true, 'Overnight 23-01 and Normal 00-00:30 overlap');
assert(rangesOverlap('23:00', '01:00', '02:00', '03:00') === false, 'Overnight 23-01 and Normal 02-03 do NOT overlap');

// 3. extractAlertText
console.log('\n3. Testing extractAlertText...');
assert(extractAlertText('Price just touched the Slow EMA') === 'Price just touched the Slow EMA', 'plain text passes through');
assert(extractAlertText('{"":"iPhone is fully charged"}') === 'iPhone is fully charged', 'Shortcuts single-value JSON is unwrapped');
assert(extractAlertText('{"msg":"iPad is fully charged."}') === 'iPad is fully charged.', 'single-value JSON with any key is unwrapped');
assert(extractAlertText(' {"":"padded"}\n') === 'padded', 'surrounding whitespace is tolerated');
assert(extractAlertText('{"text":"BTC up","ticker":"BTCUSD"}') === 'BTC up', '"text" field wins in multi-field JSON');
assert(extractAlertText('{"a":"1","b":"2"}') === '{"a":"1","b":"2"}', 'multi-field JSON without text stays raw');
assert(extractAlertText('{"price":42}') === '{"price":42}', 'single non-string value stays raw');
assert(extractAlertText('{"":""}') === '{"":""}', 'single empty string stays raw');
assert(extractAlertText('{not json') === '{not json', 'invalid JSON stays raw');
assert(extractAlertText('["a"]') === '["a"]', 'JSON array stays raw');
assert(extractAlertText('') === '', 'empty body stays empty (route returns 400)');

console.log('\n--- All Unit Tests Passed ---');
