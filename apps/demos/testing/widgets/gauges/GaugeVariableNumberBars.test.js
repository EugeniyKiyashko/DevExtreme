import { createScreenshotsComparer } from 'devextreme-screenshot-comparer';
import { Selector as $ } from 'testcafe';
import { runManualTest } from '../../../utils/visual-tests/matrix-test-helper';
import { testScreenshot } from '../../../utils/visual-tests/helpers/theme-utils';

fixture('Gauges.VariableNumberOfBars')
  .page('http://localhost:8080/')
  .before(async (ctx) => {
    ctx.initialWindowSize = [900, 600];
  });

runManualTest('Gauges', 'VariableNumberOfBars', ['jQuery', 'React', 'Vue', 'Angular'], (test) => {
  test('Bars visibility changing', async (t) => {
    const { takeScreenshot, compareResults } = createScreenshotsComparer(t);

    const checkBoxes = $('.dx-checkbox-icon');

    await t.click(checkBoxes.nth(2));
    await t.click(checkBoxes.nth(3));
    await t.wait(1000);
    await testScreenshot(t, takeScreenshot, 'bargauge_hide_bars.png', '#gauge');

    await t.click(checkBoxes.nth(2));
    await t.click(checkBoxes.nth(3));
    await t.wait(1000);
    await testScreenshot(t, takeScreenshot, 'bargauge_show_bars.png', '#gauge');

    await t
      .expect(compareResults.isValid())
      .ok(compareResults.errorMessages());
  });
});
