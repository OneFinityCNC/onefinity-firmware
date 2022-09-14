#include "report.h"
#include "config.h"
#include "usart.h"
#include "rtc.h"
#include "vars.h"


static bool _full = false;
static uint32_t _last = 0;


void report_request_full() {_full = true;}


void report_callback() {
  // Wait until output buffer is empty
  if (!usart_tx_empty()) return;

  // Limit frequency
  uint32_t now = rtc_get_time();
  if (now - _last < REPORT_RATE) return;
  _last = now;

  // Report vars
  vars_report(_full);
  _full = false;
}
