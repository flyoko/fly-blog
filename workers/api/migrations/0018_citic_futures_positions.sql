CREATE TABLE citic_futures_position_daily (
  trade_date TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('IF', 'IH', 'IC', 'IM')),
  long_position INTEGER NOT NULL CHECK (long_position >= 0),
  long_change INTEGER NOT NULL,
  short_position INTEGER NOT NULL CHECK (short_position >= 0),
  short_change INTEGER NOT NULL,
  net_position INTEGER NOT NULL,
  net_change INTEGER NOT NULL,
  contract_count INTEGER NOT NULL CHECK (contract_count >= 0),
  long_ranked_contract_count INTEGER NOT NULL CHECK (long_ranked_contract_count >= 0),
  short_ranked_contract_count INTEGER NOT NULL CHECK (short_ranked_contract_count >= 0),
  complete INTEGER NOT NULL CHECK (complete IN (0, 1)),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, product)
);

CREATE INDEX idx_citic_futures_position_product_date
  ON citic_futures_position_daily (product, trade_date DESC);

-- 2026-08-17 through 2026-08-21 are verified snapshots from the CFFEX public member-ranking CSVs.
INSERT INTO citic_futures_position_daily (
  trade_date, product, long_position, long_change, short_position, short_change,
  net_position, net_change, contract_count, long_ranked_contract_count,
  short_ranked_contract_count, complete, source_url, fetched_at, updated_at
) VALUES
('2026-08-17', 'IF', 30283, 1854, 48512, 2008, -18229, -154, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/17/IF_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-17', 'IH', 12503, -615, 24232, 67, -11729, -682, 3, 3, 3, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/17/IH_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-17', 'IC', 44243, -379, 58741, 346, -14498, -725, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/17/IC_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-17', 'IM', 64854, 1716, 90759, 719, -25905, 997, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/17/IM_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-18', 'IF', 29914, -369, 47913, -599, -17999, 230, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/18/IF_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-18', 'IH', 12778, 275, 24428, 196, -11650, 79, 3, 3, 3, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/18/IH_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-18', 'IC', 47638, 3395, 58753, 12, -11115, 3383, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/18/IC_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-18', 'IM', 63052, -1802, 87791, -2968, -24739, 1166, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/18/IM_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-19', 'IF', 33040, 3126, 51549, 3636, -18509, -510, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/19/IF_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-19', 'IH', 13743, 965, 25877, 1449, -12134, -484, 3, 3, 3, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/19/IH_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-19', 'IC', 50970, 3332, 62299, 3546, -11329, -214, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/19/IC_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-19', 'IM', 70790, 7738, 97451, 9660, -26661, -1922, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/19/IM_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-20', 'IF', 28350, -4690, 47057, -4492, -18707, -198, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/20/IF_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-20', 'IH', 11722, -2021, 24552, -1325, -12830, -696, 3, 3, 3, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/20/IH_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-20', 'IC', 45202, -5768, 57513, -4786, -12311, -982, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/20/IC_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-20', 'IM', 63728, -7062, 90570, -6881, -26842, -181, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/20/IM_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-21', 'IF', 30944, 2594, 50277, 3220, -19333, -626, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/21/IF_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-21', 'IH', 10232, -1490, 22820, -1732, -12588, 242, 3, 3, 3, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/21/IH_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-21', 'IC', 40533, -4669, 52692, -4821, -12159, 152, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/21/IC_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z'),
('2026-08-21', 'IM', 61232, -2496, 90861, 291, -29629, -2787, 4, 4, 4, 1, 'http://www.cffex.com.cn/sj/ccpm/202608/21/IM_1.csv', '2026-08-23T13:20:00.000Z', '2026-08-23T13:20:00.000Z')
;
