import dateUtils from '@js/core/utils/date';
import { getSkippedHoursInRange } from '@ts/scheduler/r1/utils/index';

import { ExpressionUtils } from '../../m_expression_utils';
import BaseAppointmentsStrategy from './m_strategy_base';

const DEFAULT_APPOINTMENT_HEIGHT = 60;
const MIN_APPOINTMENT_HEIGHT = 35;
const DROP_DOWN_BUTTON_OFFSET = 2;

const toMs = dateUtils.dateToMilliseconds;

class HorizontalRenderingStrategy extends BaseAppointmentsStrategy {
  _needVerifyItemSize() {
    return true;
  }

  calculateAppointmentWidth(appointment, position) {
    const cellWidth = this.cellWidth || this.getAppointmentMinSize();
    const allDay = ExpressionUtils.getField(this.dataAccessors, 'allDay', appointment);
    const {
      startDate,
      endDate,
      normalizedEndDate,
    } = position.info.appointment;

    let duration = this.getAppointmentDurationInMs(startDate, normalizedEndDate, allDay);

    duration = this._adjustDurationByDaylightDiff(duration, startDate, normalizedEndDate);

    const cellDuration = this.cellDurationInMinutes * toMs('minute');
    const skippedHours = getSkippedHoursInRange(
      startDate,
      endDate,
      appointment.allDay,
      this.viewDataProvider,
    );
    const durationInCells = (duration - skippedHours * toMs('hour')) / cellDuration;
    const width = this.cropAppointmentWidth(durationInCells * cellWidth, cellWidth);

    return width;
  }

  _needAdjustDuration(diff) {
    return diff < 0;
  }

  getAppointmentGeometry(coordinates) {
    const result = this._customizeAppointmentGeometry(coordinates);

    return super.getAppointmentGeometry(result);
  }

  _customizeAppointmentGeometry(coordinates) {
    const config = this._calculateGeometryConfig(coordinates);

    return this._customizeCoordinates(coordinates, config.height, config.appointmentCountPerCell, config.offset);
  }

  _getOffsets() {
    return {
      unlimited: 0,
      auto: 0,
    };
  }

  _getCompactLeftCoordinate(itemLeft, index) {
    const cellWidth = this.cellWidth || this.getAppointmentMinSize();

    return itemLeft + cellWidth * index;
  }

  _getMaxHeight() {
    return this.cellHeight || this.getAppointmentMinSize();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _getAppointmentCount(overlappingMode, coordinates) {
    return this._getMaxAppointmentCountPerCellByType(false);
  }

  _getAppointmentDefaultHeight() {
    return DEFAULT_APPOINTMENT_HEIGHT;
  }

  _getAppointmentMinHeight() {
    return MIN_APPOINTMENT_HEIGHT;
  }

  _sortCondition(a, b) {
    return this._columnCondition(a, b);
  }

  _getOrientation() {
    return ['left', 'right', 'top'];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDropDownAppointmentWidth(intervalCount, isAllDay) {
    return this.cellWidth - DROP_DOWN_BUTTON_OFFSET * 2;
  }

  getDeltaTime(args, initialSize) {
    let deltaTime = 0;
    const deltaWidth = args.width - initialSize.width;

    deltaTime = toMs('minute') * Math.round(deltaWidth / this.cellWidth * this.cellDurationInMinutes);

    return deltaTime;
  }

  isAllDay(appointmentData) {
    return ExpressionUtils.getField(this.dataAccessors, 'allDay', appointmentData);
  }

  _isItemsCross(firstItem, secondItem) {
    const orientation = this._getOrientation();

    return this._checkItemsCrossing(firstItem, secondItem, orientation);
  }

  getPositionShift(timeShift) {
    const positionShift = super.getPositionShift(timeShift);
    let left = this.cellWidth * timeShift;

    if (this.rtlEnabled) {
      left *= -1;
    }

    left += positionShift.left;

    return {
      top: 0,
      left,
      cellPosition: left,
    };
  }

  supportCompactDropDownAppointments() {
    return false;
  }
}

export default HorizontalRenderingStrategy;
