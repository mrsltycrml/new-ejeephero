import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export interface RouteData {
  id: string;
  name: string;
  description: string;
  color_code: string;
  operating_hours: string;
  base_fare: number;
  per_km_rate: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

export interface TerminalData {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  regular_fare: number;
  student_fare: number;
  elderly_fare: number;
  disabled_fare: number;
  is_esakay_hub?: boolean;
  landmark_photo?: string;
  landmark_desc?: string;
  is_well_lit?: boolean;
  cctv_monitored?: boolean;
}

export interface VehicleData {
  id: string;
  vehicle_id: string;
  plate_number: string;
  body_number: string;
  route_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  passenger_count: number;
  max_capacity: number;
  is_full: boolean;
  status: 'Maluwag' | 'Sakto' | 'Puno';
}

// ─── STATIC MAKATI E-JEEPNEY TRANSIT DATASET (SO1 & SO2 Ground Truth) ───
export const MAKATI_PRIMARY_ROUTE: RouteData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'MRT BUENDIA - MANDALUYONG CITY HALL',
  description: 'Modernized & Electric PJU Route connecting MRT Buendia Hub to Mandaluyong City Hall via Jupiter St, Makati Ave, Estrella-Pantaleon Bridge, and Boni Ave',
  color_code: '#C41E3A',
  operating_hours: '06:00 AM - 10:00 PM',
  base_fare: 14.00,
  per_km_rate: 1.50,
  coordinates: [
    {
        "latitude": 14.557635,
        "longitude": 121.032655
    },
    {
        "latitude": 14.557634,
        "longitude": 121.032656
    },
    {
        "latitude": 14.557222,
        "longitude": 121.032992
    },
    {
        "latitude": 14.557057,
        "longitude": 121.033121
    },
    {
        "latitude": 14.556811,
        "longitude": 121.033223
    },
    {
        "latitude": 14.555833,
        "longitude": 121.033993
    },
    {
        "latitude": 14.555503,
        "longitude": 121.034252
    },
    {
        "latitude": 14.555469,
        "longitude": 121.034339
    },
    {
        "latitude": 14.555445,
        "longitude": 121.034367
    },
    {
        "latitude": 14.555267,
        "longitude": 121.034536
    },
    {
        "latitude": 14.55515,
        "longitude": 121.034648
    },
    {
        "latitude": 14.555129,
        "longitude": 121.034679
    },
    {
        "latitude": 14.555126,
        "longitude": 121.034706
    },
    {
        "latitude": 14.555131,
        "longitude": 121.034723
    },
    {
        "latitude": 14.555139,
        "longitude": 121.034743
    },
    {
        "latitude": 14.555151,
        "longitude": 121.034757
    },
    {
        "latitude": 14.555169,
        "longitude": 121.034766
    },
    {
        "latitude": 14.555189,
        "longitude": 121.034763
    },
    {
        "latitude": 14.555212,
        "longitude": 121.034758
    },
    {
        "latitude": 14.555232,
        "longitude": 121.034745
    },
    {
        "latitude": 14.555369,
        "longitude": 121.034604
    },
    {
        "latitude": 14.555501,
        "longitude": 121.034477
    },
    {
        "latitude": 14.555542,
        "longitude": 121.034455
    },
    {
        "latitude": 14.555642,
        "longitude": 121.034439
    },
    {
        "latitude": 14.556947,
        "longitude": 121.03339
    },
    {
        "latitude": 14.557055,
        "longitude": 121.033287
    },
    {
        "latitude": 14.557296,
        "longitude": 121.033093
    },
    {
        "latitude": 14.557864,
        "longitude": 121.032638
    },
    {
        "latitude": 14.558263,
        "longitude": 121.032279
    },
    {
        "latitude": 14.558675,
        "longitude": 121.0319
    },
    {
        "latitude": 14.559152,
        "longitude": 121.031405
    },
    {
        "latitude": 14.559247,
        "longitude": 121.0313
    },
    {
        "latitude": 14.559466,
        "longitude": 121.031057
    },
    {
        "latitude": 14.559609,
        "longitude": 121.0309
    },
    {
        "latitude": 14.559695,
        "longitude": 121.030806
    },
    {
        "latitude": 14.559854,
        "longitude": 121.030619
    },
    {
        "latitude": 14.560149,
        "longitude": 121.030241
    },
    {
        "latitude": 14.560313,
        "longitude": 121.030018
    },
    {
        "latitude": 14.560585,
        "longitude": 121.029616
    },
    {
        "latitude": 14.560769,
        "longitude": 121.029308
    },
    {
        "latitude": 14.561064,
        "longitude": 121.028777
    },
    {
        "latitude": 14.561207,
        "longitude": 121.028486
    },
    {
        "latitude": 14.561355,
        "longitude": 121.028145
    },
    {
        "latitude": 14.561434,
        "longitude": 121.028089
    },
    {
        "latitude": 14.56152,
        "longitude": 121.028044
    },
    {
        "latitude": 14.5616,
        "longitude": 121.028014
    },
    {
        "latitude": 14.561683,
        "longitude": 121.027995
    },
    {
        "latitude": 14.561968,
        "longitude": 121.028122
    },
    {
        "latitude": 14.56207,
        "longitude": 121.028167
    },
    {
        "latitude": 14.562031,
        "longitude": 121.028257
    },
    {
        "latitude": 14.561952,
        "longitude": 121.028425
    },
    {
        "latitude": 14.561892,
        "longitude": 121.028573
    },
    {
        "latitude": 14.56186,
        "longitude": 121.028643
    },
    {
        "latitude": 14.561811,
        "longitude": 121.028749
    },
    {
        "latitude": 14.561787,
        "longitude": 121.028801
    },
    {
        "latitude": 14.561711,
        "longitude": 121.028953
    },
    {
        "latitude": 14.561605,
        "longitude": 121.029162
    },
    {
        "latitude": 14.56148,
        "longitude": 121.029381
    },
    {
        "latitude": 14.561404,
        "longitude": 121.029338
    },
    {
        "latitude": 14.561397,
        "longitude": 121.029334
    },
    {
        "latitude": 14.561344,
        "longitude": 121.029301
    },
    {
        "latitude": 14.561078,
        "longitude": 121.029745
    },
    {
        "latitude": 14.560952,
        "longitude": 121.029964
    },
    {
        "latitude": 14.560995,
        "longitude": 121.029889
    },
    {
        "latitude": 14.561078,
        "longitude": 121.029745
    },
    {
        "latitude": 14.561135,
        "longitude": 121.029781
    },
    {
        "latitude": 14.561212,
        "longitude": 121.029825
    },
    {
        "latitude": 14.561377,
        "longitude": 121.029556
    },
    {
        "latitude": 14.56148,
        "longitude": 121.029381
    },
    {
        "latitude": 14.561605,
        "longitude": 121.029162
    },
    {
        "latitude": 14.561711,
        "longitude": 121.028953
    },
    {
        "latitude": 14.561787,
        "longitude": 121.028801
    },
    {
        "latitude": 14.561811,
        "longitude": 121.028749
    },
    {
        "latitude": 14.56186,
        "longitude": 121.028643
    },
    {
        "latitude": 14.561892,
        "longitude": 121.028573
    },
    {
        "latitude": 14.562182,
        "longitude": 121.02871
    },
    {
        "latitude": 14.562259,
        "longitude": 121.028698
    },
    {
        "latitude": 14.56237,
        "longitude": 121.028679
    },
    {
        "latitude": 14.562405,
        "longitude": 121.028671
    },
    {
        "latitude": 14.562648,
        "longitude": 121.028602
    },
    {
        "latitude": 14.562729,
        "longitude": 121.028559
    },
    {
        "latitude": 14.562767,
        "longitude": 121.028522
    },
    {
        "latitude": 14.562824,
        "longitude": 121.028465
    },
    {
        "latitude": 14.562999,
        "longitude": 121.028553
    },
    {
        "latitude": 14.563286,
        "longitude": 121.028707
    },
    {
        "latitude": 14.563636,
        "longitude": 121.028893
    },
    {
        "latitude": 14.563791,
        "longitude": 121.028977
    },
    {
        "latitude": 14.564103,
        "longitude": 121.029145
    },
    {
        "latitude": 14.564425,
        "longitude": 121.029314
    },
    {
        "latitude": 14.56444,
        "longitude": 121.029322
    },
    {
        "latitude": 14.564521,
        "longitude": 121.029359
    },
    {
        "latitude": 14.564556,
        "longitude": 121.029379
    },
    {
        "latitude": 14.564618,
        "longitude": 121.02941
    },
    {
        "latitude": 14.564923,
        "longitude": 121.029559
    },
    {
        "latitude": 14.565289,
        "longitude": 121.029739
    },
    {
        "latitude": 14.565323,
        "longitude": 121.029756
    },
    {
        "latitude": 14.565362,
        "longitude": 121.029775
    },
    {
        "latitude": 14.565405,
        "longitude": 121.029796
    },
    {
        "latitude": 14.565687,
        "longitude": 121.029935
    },
    {
        "latitude": 14.565742,
        "longitude": 121.029962
    },
    {
        "latitude": 14.566042,
        "longitude": 121.030115
    },
    {
        "latitude": 14.566366,
        "longitude": 121.030269
    },
    {
        "latitude": 14.566791,
        "longitude": 121.030478
    },
    {
        "latitude": 14.566974,
        "longitude": 121.030554
    },
    {
        "latitude": 14.567065,
        "longitude": 121.030587
    },
    {
        "latitude": 14.567412,
        "longitude": 121.030718
    },
    {
        "latitude": 14.567519,
        "longitude": 121.03072
    },
    {
        "latitude": 14.567617,
        "longitude": 121.030722
    },
    {
        "latitude": 14.567704,
        "longitude": 121.030729
    },
    {
        "latitude": 14.567803,
        "longitude": 121.030732
    },
    {
        "latitude": 14.567917,
        "longitude": 121.030742
    },
    {
        "latitude": 14.568048,
        "longitude": 121.03075
    },
    {
        "latitude": 14.568164,
        "longitude": 121.030764
    },
    {
        "latitude": 14.568263,
        "longitude": 121.03079
    },
    {
        "latitude": 14.568384,
        "longitude": 121.030844
    },
    {
        "latitude": 14.568489,
        "longitude": 121.030893
    },
    {
        "latitude": 14.568598,
        "longitude": 121.030986
    },
    {
        "latitude": 14.569514,
        "longitude": 121.031915
    },
    {
        "latitude": 14.569652,
        "longitude": 121.032035
    },
    {
        "latitude": 14.569797,
        "longitude": 121.032134
    },
    {
        "latitude": 14.56987,
        "longitude": 121.032158
    },
    {
        "latitude": 14.569954,
        "longitude": 121.032167
    },
    {
        "latitude": 14.570023,
        "longitude": 121.032162
    },
    {
        "latitude": 14.570082,
        "longitude": 121.032147
    },
    {
        "latitude": 14.570152,
        "longitude": 121.032118
    },
    {
        "latitude": 14.570244,
        "longitude": 121.032055
    },
    {
        "latitude": 14.57033,
        "longitude": 121.031983
    },
    {
        "latitude": 14.570395,
        "longitude": 121.031904
    },
    {
        "latitude": 14.570449,
        "longitude": 121.031816
    },
    {
        "latitude": 14.570475,
        "longitude": 121.031722
    },
    {
        "latitude": 14.57049,
        "longitude": 121.031611
    },
    {
        "latitude": 14.570445,
        "longitude": 121.031516
    },
    {
        "latitude": 14.570398,
        "longitude": 121.031438
    },
    {
        "latitude": 14.570342,
        "longitude": 121.031383
    },
    {
        "latitude": 14.570286,
        "longitude": 121.031446
    },
    {
        "latitude": 14.570135,
        "longitude": 121.031615
    },
    {
        "latitude": 14.570119,
        "longitude": 121.031629
    },
    {
        "latitude": 14.570095,
        "longitude": 121.031655
    },
    {
        "latitude": 14.569973,
        "longitude": 121.031787
    },
    {
        "latitude": 14.5699,
        "longitude": 121.031867
    },
    {
        "latitude": 14.569825,
        "longitude": 121.03195
    },
    {
        "latitude": 14.569807,
        "longitude": 121.03197
    },
    {
        "latitude": 14.569677,
        "longitude": 121.032119
    },
    {
        "latitude": 14.569669,
        "longitude": 121.032128
    },
    {
        "latitude": 14.56955,
        "longitude": 121.032259
    },
    {
        "latitude": 14.569365,
        "longitude": 121.032435
    },
    {
        "latitude": 14.56896,
        "longitude": 121.032813
    },
    {
        "latitude": 14.568551,
        "longitude": 121.033212
    },
    {
        "latitude": 14.568329,
        "longitude": 121.033445
    },
    {
        "latitude": 14.568125,
        "longitude": 121.033704
    },
    {
        "latitude": 14.568159,
        "longitude": 121.033737
    },
    {
        "latitude": 14.568817,
        "longitude": 121.034359
    },
    {
        "latitude": 14.568982,
        "longitude": 121.034519
    },
    {
        "latitude": 14.569137,
        "longitude": 121.034667
    },
    {
        "latitude": 14.569237,
        "longitude": 121.034758
    },
    {
        "latitude": 14.569432,
        "longitude": 121.034931
    },
    {
        "latitude": 14.569614,
        "longitude": 121.035106
    },
    {
        "latitude": 14.569624,
        "longitude": 121.035115
    },
    {
        "latitude": 14.569654,
        "longitude": 121.035141
    },
    {
        "latitude": 14.569706,
        "longitude": 121.035191
    },
    {
        "latitude": 14.569792,
        "longitude": 121.03527
    },
    {
        "latitude": 14.569853,
        "longitude": 121.035349
    },
    {
        "latitude": 14.569872,
        "longitude": 121.035402
    },
    {
        "latitude": 14.569875,
        "longitude": 121.035499
    },
    {
        "latitude": 14.569735,
        "longitude": 121.036112
    },
    {
        "latitude": 14.569721,
        "longitude": 121.036195
    },
    {
        "latitude": 14.569658,
        "longitude": 121.036126
    },
    {
        "latitude": 14.569484,
        "longitude": 121.036071
    },
    {
        "latitude": 14.569453,
        "longitude": 121.036063
    },
    {
        "latitude": 14.569417,
        "longitude": 121.036061
    },
    {
        "latitude": 14.569391,
        "longitude": 121.036062
    },
    {
        "latitude": 14.569356,
        "longitude": 121.03607
    },
    {
        "latitude": 14.56933,
        "longitude": 121.036082
    },
    {
        "latitude": 14.569304,
        "longitude": 121.036099
    },
    {
        "latitude": 14.569275,
        "longitude": 121.036128
    },
    {
        "latitude": 14.569204,
        "longitude": 121.036224
    },
    {
        "latitude": 14.56862,
        "longitude": 121.037009
    },
    {
        "latitude": 14.568554,
        "longitude": 121.037088
    },
    {
        "latitude": 14.56852,
        "longitude": 121.037123
    },
    {
        "latitude": 14.568488,
        "longitude": 121.037148
    },
    {
        "latitude": 14.568447,
        "longitude": 121.037179
    },
    {
        "latitude": 14.568411,
        "longitude": 121.037203
    },
    {
        "latitude": 14.568374,
        "longitude": 121.037225
    },
    {
        "latitude": 14.568335,
        "longitude": 121.037243
    },
    {
        "latitude": 14.568283,
        "longitude": 121.037269
    },
    {
        "latitude": 14.568224,
        "longitude": 121.037293
    },
    {
        "latitude": 14.568186,
        "longitude": 121.037306
    },
    {
        "latitude": 14.568132,
        "longitude": 121.037321
    },
    {
        "latitude": 14.566822,
        "longitude": 121.037619
    },
    {
        "latitude": 14.565512,
        "longitude": 121.037917
    },
    {
        "latitude": 14.565477,
        "longitude": 121.037924
    },
    {
        "latitude": 14.565262,
        "longitude": 121.037968
    },
    {
        "latitude": 14.565211,
        "longitude": 121.037988
    },
    {
        "latitude": 14.56507,
        "longitude": 121.038044
    },
    {
        "latitude": 14.564919,
        "longitude": 121.038106
    },
    {
        "latitude": 14.564814,
        "longitude": 121.038148
    },
    {
        "latitude": 14.564747,
        "longitude": 121.038177
    },
    {
        "latitude": 14.564158,
        "longitude": 121.038426
    },
    {
        "latitude": 14.564085,
        "longitude": 121.038457
    },
    {
        "latitude": 14.564004,
        "longitude": 121.038491
    },
    {
        "latitude": 14.56405,
        "longitude": 121.038606
    },
    {
        "latitude": 14.564126,
        "longitude": 121.038577
    },
    {
        "latitude": 14.564205,
        "longitude": 121.03854
    },
    {
        "latitude": 14.564785,
        "longitude": 121.038296
    },
    {
        "latitude": 14.564858,
        "longitude": 121.038265
    },
    {
        "latitude": 14.564938,
        "longitude": 121.038233
    },
    {
        "latitude": 14.564957,
        "longitude": 121.038226
    },
    {
        "latitude": 14.565049,
        "longitude": 121.038191
    },
    {
        "latitude": 14.565231,
        "longitude": 121.038116
    },
    {
        "latitude": 14.565301,
        "longitude": 121.038088
    },
    {
        "latitude": 14.565495,
        "longitude": 121.038013
    },
    {
        "latitude": 14.56553,
        "longitude": 121.037999
    },
    {
        "latitude": 14.566631,
        "longitude": 121.037751
    },
    {
        "latitude": 14.568148,
        "longitude": 121.037396
    },
    {
        "latitude": 14.568233,
        "longitude": 121.037371
    },
    {
        "latitude": 14.568298,
        "longitude": 121.037345
    },
    {
        "latitude": 14.568353,
        "longitude": 121.037318
    },
    {
        "latitude": 14.568403,
        "longitude": 121.037292
    },
    {
        "latitude": 14.568461,
        "longitude": 121.037259
    },
    {
        "latitude": 14.568496,
        "longitude": 121.037234
    },
    {
        "latitude": 14.568531,
        "longitude": 121.037208
    },
    {
        "latitude": 14.568565,
        "longitude": 121.037176
    },
    {
        "latitude": 14.568595,
        "longitude": 121.037145
    },
    {
        "latitude": 14.568633,
        "longitude": 121.037104
    },
    {
        "latitude": 14.568673,
        "longitude": 121.037052
    },
    {
        "latitude": 14.569068,
        "longitude": 121.036523
    },
    {
        "latitude": 14.569311,
        "longitude": 121.036201
    },
    {
        "latitude": 14.56934,
        "longitude": 121.036166
    },
    {
        "latitude": 14.569367,
        "longitude": 121.036145
    },
    {
        "latitude": 14.569388,
        "longitude": 121.036138
    },
    {
        "latitude": 14.569415,
        "longitude": 121.036134
    },
    {
        "latitude": 14.569441,
        "longitude": 121.036137
    },
    {
        "latitude": 14.569467,
        "longitude": 121.036142
    },
    {
        "latitude": 14.569631,
        "longitude": 121.036199
    },
    {
        "latitude": 14.569721,
        "longitude": 121.036195
    },
    {
        "latitude": 14.569835,
        "longitude": 121.036262
    },
    {
        "latitude": 14.57007,
        "longitude": 121.036453
    },
    {
        "latitude": 14.570116,
        "longitude": 121.036491
    },
    {
        "latitude": 14.570437,
        "longitude": 121.036752
    },
    {
        "latitude": 14.570471,
        "longitude": 121.036709
    },
    {
        "latitude": 14.570749,
        "longitude": 121.036351
    },
    {
        "latitude": 14.570507,
        "longitude": 121.035887
    },
    {
        "latitude": 14.570166,
        "longitude": 121.036075
    },
    {
        "latitude": 14.569835,
        "longitude": 121.036262
    },
    {
        "latitude": 14.569721,
        "longitude": 121.036195
    },
    {
        "latitude": 14.569658,
        "longitude": 121.036126
    },
    {
        "latitude": 14.569484,
        "longitude": 121.036071
    },
    {
        "latitude": 14.569453,
        "longitude": 121.036063
    },
    {
        "latitude": 14.569417,
        "longitude": 121.036061
    },
    {
        "latitude": 14.569391,
        "longitude": 121.036062
    },
    {
        "latitude": 14.569356,
        "longitude": 121.03607
    },
    {
        "latitude": 14.56933,
        "longitude": 121.036082
    },
    {
        "latitude": 14.569304,
        "longitude": 121.036099
    },
    {
        "latitude": 14.569275,
        "longitude": 121.036128
    },
    {
        "latitude": 14.569204,
        "longitude": 121.036224
    },
    {
        "latitude": 14.569179,
        "longitude": 121.036203
    },
    {
        "latitude": 14.569144,
        "longitude": 121.036174
    },
    {
        "latitude": 14.568966,
        "longitude": 121.036027
    },
    {
        "latitude": 14.568867,
        "longitude": 121.035945
    },
    {
        "latitude": 14.568857,
        "longitude": 121.035917
    },
    {
        "latitude": 14.568814,
        "longitude": 121.035878
    },
    {
        "latitude": 14.568763,
        "longitude": 121.035837
    },
    {
        "latitude": 14.568588,
        "longitude": 121.035701
    },
    {
        "latitude": 14.568498,
        "longitude": 121.035632
    },
    {
        "latitude": 14.568093,
        "longitude": 121.035298
    },
    {
        "latitude": 14.568029,
        "longitude": 121.035262
    },
    {
        "latitude": 14.567977,
        "longitude": 121.035244
    },
    {
        "latitude": 14.567917,
        "longitude": 121.03524
    },
    {
        "latitude": 14.56786,
        "longitude": 121.035263
    },
    {
        "latitude": 14.567799,
        "longitude": 121.035284
    },
    {
        "latitude": 14.567721,
        "longitude": 121.035286
    },
    {
        "latitude": 14.567647,
        "longitude": 121.035274
    },
    {
        "latitude": 14.567584,
        "longitude": 121.035241
    },
    {
        "latitude": 14.567585,
        "longitude": 121.0352
    },
    {
        "latitude": 14.567601,
        "longitude": 121.035057
    },
    {
        "latitude": 14.567612,
        "longitude": 121.034913
    },
    {
        "latitude": 14.567681,
        "longitude": 121.03471
    },
    {
        "latitude": 14.567726,
        "longitude": 121.034569
    },
    {
        "latitude": 14.567735,
        "longitude": 121.034544
    },
    {
        "latitude": 14.567819,
        "longitude": 121.034319
    },
    {
        "latitude": 14.567961,
        "longitude": 121.033947
    },
    {
        "latitude": 14.568085,
        "longitude": 121.033756
    },
    {
        "latitude": 14.568125,
        "longitude": 121.033704
    },
    {
        "latitude": 14.568329,
        "longitude": 121.033445
    },
    {
        "latitude": 14.568551,
        "longitude": 121.033212
    },
    {
        "latitude": 14.56896,
        "longitude": 121.032813
    },
    {
        "latitude": 14.569365,
        "longitude": 121.032435
    },
    {
        "latitude": 14.56955,
        "longitude": 121.032259
    },
    {
        "latitude": 14.569669,
        "longitude": 121.032128
    },
    {
        "latitude": 14.569677,
        "longitude": 121.032119
    },
    {
        "latitude": 14.569807,
        "longitude": 121.03197
    },
    {
        "latitude": 14.569825,
        "longitude": 121.03195
    },
    {
        "latitude": 14.5699,
        "longitude": 121.031867
    },
    {
        "latitude": 14.569973,
        "longitude": 121.031787
    },
    {
        "latitude": 14.570095,
        "longitude": 121.031655
    },
    {
        "latitude": 14.570119,
        "longitude": 121.031629
    },
    {
        "latitude": 14.570135,
        "longitude": 121.031615
    },
    {
        "latitude": 14.570286,
        "longitude": 121.031446
    },
    {
        "latitude": 14.570342,
        "longitude": 121.031383
    },
    {
        "latitude": 14.570461,
        "longitude": 121.031252
    },
    {
        "latitude": 14.570592,
        "longitude": 121.03111
    },
    {
        "latitude": 14.570691,
        "longitude": 121.031008
    },
    {
        "latitude": 14.571067,
        "longitude": 121.030607
    },
    {
        "latitude": 14.571104,
        "longitude": 121.030568
    },
    {
        "latitude": 14.571258,
        "longitude": 121.030405
    },
    {
        "latitude": 14.571931,
        "longitude": 121.029645
    },
    {
        "latitude": 14.572001,
        "longitude": 121.029566
    },
    {
        "latitude": 14.572051,
        "longitude": 121.029615
    },
    {
        "latitude": 14.572297,
        "longitude": 121.02982
    },
    {
        "latitude": 14.572377,
        "longitude": 121.029923
    },
    {
        "latitude": 14.572429,
        "longitude": 121.029965
    },
    {
        "latitude": 14.572442,
        "longitude": 121.029994
    },
    {
        "latitude": 14.572499,
        "longitude": 121.030045
    },
    {
        "latitude": 14.5725,
        "longitude": 121.030066
    },
    {
        "latitude": 14.572508,
        "longitude": 121.030085
    },
    {
        "latitude": 14.572526,
        "longitude": 121.030104
    },
    {
        "latitude": 14.57255,
        "longitude": 121.030113
    },
    {
        "latitude": 14.572576,
        "longitude": 121.03011
    },
    {
        "latitude": 14.572598,
        "longitude": 121.030096
    },
    {
        "latitude": 14.572656,
        "longitude": 121.030133
    },
    {
        "latitude": 14.573004,
        "longitude": 121.030412
    },
    {
        "latitude": 14.573027,
        "longitude": 121.030454
    },
    {
        "latitude": 14.573029,
        "longitude": 121.030513
    },
    {
        "latitude": 14.57287,
        "longitude": 121.030732
    },
    {
        "latitude": 14.572812,
        "longitude": 121.030751
    },
    {
        "latitude": 14.57277,
        "longitude": 121.030752
    },
    {
        "latitude": 14.572729,
        "longitude": 121.03074
    },
    {
        "latitude": 14.572692,
        "longitude": 121.03071
    },
    {
        "latitude": 14.57265,
        "longitude": 121.030691
    },
    {
        "latitude": 14.572611,
        "longitude": 121.030697
    },
    {
        "latitude": 14.572589,
        "longitude": 121.03071
    },
    {
        "latitude": 14.572453,
        "longitude": 121.030894
    },
    {
        "latitude": 14.572312,
        "longitude": 121.031084
    },
    {
        "latitude": 14.572268,
        "longitude": 121.031145
    },
    {
        "latitude": 14.572255,
        "longitude": 121.031161
    },
    {
        "latitude": 14.572198,
        "longitude": 121.031239
    },
    {
        "latitude": 14.571977,
        "longitude": 121.031538
    },
    {
        "latitude": 14.571908,
        "longitude": 121.031615
    },
    {
        "latitude": 14.572054,
        "longitude": 121.031737
    },
    {
        "latitude": 14.572102,
        "longitude": 121.031773
    },
    {
        "latitude": 14.572143,
        "longitude": 121.031804
    },
    {
        "latitude": 14.572171,
        "longitude": 121.031826
    },
    {
        "latitude": 14.572861,
        "longitude": 121.030921
    },
    {
        "latitude": 14.572952,
        "longitude": 121.030996
    },
    {
        "latitude": 14.572985,
        "longitude": 121.030957
    },
    {
        "latitude": 14.573155,
        "longitude": 121.030757
    },
    {
        "latitude": 14.573195,
        "longitude": 121.030704
    },
    {
        "latitude": 14.573261,
        "longitude": 121.030615
    },
    {
        "latitude": 14.573407,
        "longitude": 121.030416
    },
    {
        "latitude": 14.573625,
        "longitude": 121.03012
    },
    {
        "latitude": 14.573647,
        "longitude": 121.030093
    },
    {
        "latitude": 14.573763,
        "longitude": 121.030204
    },
    {
        "latitude": 14.573888,
        "longitude": 121.030335
    },
    {
        "latitude": 14.574237,
        "longitude": 121.030689
    },
    {
        "latitude": 14.574586,
        "longitude": 121.031042
    },
    {
        "latitude": 14.574717,
        "longitude": 121.031172
    },
    {
        "latitude": 14.575014,
        "longitude": 121.031473
    },
    {
        "latitude": 14.575163,
        "longitude": 121.031624
    },
    {
        "latitude": 14.575395,
        "longitude": 121.031859
    },
    {
        "latitude": 14.575446,
        "longitude": 121.031913
    },
    {
        "latitude": 14.575811,
        "longitude": 121.032283
    },
    {
        "latitude": 14.576118,
        "longitude": 121.032595
    },
    {
        "latitude": 14.57631,
        "longitude": 121.032789
    },
    {
        "latitude": 14.576384,
        "longitude": 121.032863
    },
    {
        "latitude": 14.576438,
        "longitude": 121.032918
    },
    {
        "latitude": 14.576664,
        "longitude": 121.033149
    },
    {
        "latitude": 14.576676,
        "longitude": 121.033166
    },
    {
        "latitude": 14.576683,
        "longitude": 121.033189
    },
    {
        "latitude": 14.576693,
        "longitude": 121.033216
    },
    {
        "latitude": 14.576693,
        "longitude": 121.033243
    },
    {
        "latitude": 14.576663,
        "longitude": 121.033286
    },
    {
        "latitude": 14.576626,
        "longitude": 121.033338
    },
    {
        "latitude": 14.576528,
        "longitude": 121.033502
    },
    {
        "latitude": 14.576465,
        "longitude": 121.03365
    },
    {
        "latitude": 14.57645,
        "longitude": 121.033712
    },
    {
        "latitude": 14.576427,
        "longitude": 121.033807
    },
    {
        "latitude": 14.576412,
        "longitude": 121.033898
    },
    {
        "latitude": 14.576408,
        "longitude": 121.033975
    },
    {
        "latitude": 14.576418,
        "longitude": 121.034126
    },
    {
        "latitude": 14.576447,
        "longitude": 121.034231
    },
    {
        "latitude": 14.576474,
        "longitude": 121.034313
    },
    {
        "latitude": 14.576523,
        "longitude": 121.034423
    },
    {
        "latitude": 14.576583,
        "longitude": 121.034538
    },
    {
        "latitude": 14.576608,
        "longitude": 121.034576
    },
    {
        "latitude": 14.576632,
        "longitude": 121.034611
    },
    {
        "latitude": 14.576668,
        "longitude": 121.034652
    },
    {
        "latitude": 14.57672,
        "longitude": 121.034698
    },
    {
        "latitude": 14.576803,
        "longitude": 121.034766
    },
    {
        "latitude": 14.576873,
        "longitude": 121.034806
    },
    {
        "latitude": 14.576913,
        "longitude": 121.034824
    },
    {
        "latitude": 14.577002,
        "longitude": 121.034859
    },
    {
        "latitude": 14.577044,
        "longitude": 121.034876
    },
    {
        "latitude": 14.577136,
        "longitude": 121.034889
    },
    {
        "latitude": 14.577239,
        "longitude": 121.034903
    },
    {
        "latitude": 14.577349,
        "longitude": 121.03491
    },
    {
        "latitude": 14.577491,
        "longitude": 121.034902
    },
    {
        "latitude": 14.577597,
        "longitude": 121.034876
    },
    {
        "latitude": 14.577708,
        "longitude": 121.034834
    },
    {
        "latitude": 14.577819,
        "longitude": 121.03477
    },
    {
        "latitude": 14.577863,
        "longitude": 121.034748
    },
    {
        "latitude": 14.578015,
        "longitude": 121.034635
    },
    {
        "latitude": 14.578107,
        "longitude": 121.034536
    },
    {
        "latitude": 14.578169,
        "longitude": 121.034466
    },
    {
        "latitude": 14.57822,
        "longitude": 121.034393
    },
    {
        "latitude": 14.578244,
        "longitude": 121.034357
    },
    {
        "latitude": 14.578322,
        "longitude": 121.034201
    }
],
};

export const MAKATI_OFFICIAL_TERMINALS: TerminalData[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'MRT BUENDIA / ZODIAC TERMINAL',
    latitude: 14.557635,
    longitude: 121.032655,
    sequence_order: 0,
    regular_fare: 0.00,
    student_fare: 0.00,
    elderly_fare: 0.00,
    disabled_fare: 0.00,
    is_esakay_hub: true,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Major transit interchange beneath MRT-3 Buendia Station along EDSA & Zodiac St with illuminated waiting shed and dedicated dispatch bay.',
    is_well_lit: true,
    cctv_monitored: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'JUPITER ST., COR. MAKATI AVENUE',
    latitude: 14.560995,
    longitude: 121.029889,
    sequence_order: 1,
    regular_fare: 14.00,
    student_fare: 11.20,
    elderly_fare: 11.20,
    disabled_fare: 11.20,
    is_esakay_hub: false,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Corner of Jupiter St. and Makati Avenue across commercial establishments with bright street illumination.',
    is_well_lit: true,
    cctv_monitored: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'LOPEZ DRIVE / ESTRELLA PANTALEON',
    latitude: 14.566822,
    longitude: 121.037619,
    sequence_order: 2,
    regular_fare: 14.00,
    student_fare: 11.20,
    elderly_fare: 11.20,
    disabled_fare: 11.20,
    is_esakay_hub: false,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Estrella-Pantaleon Bridge entrance near Rockwell Center. Barangay Tanod post stationed.',
    is_well_lit: true,
    cctv_monitored: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'CITY MANDALUYONG SCIENCE HIGH',
    latitude: 14.568588,
    longitude: 121.035701,
    sequence_order: 3,
    regular_fare: 14.00,
    student_fare: 11.20,
    elderly_fare: 11.20,
    disabled_fare: 11.20,
    is_esakay_hub: false,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Designated loading bay on E. Pantaleon Street near school gate.',
    is_well_lit: true,
    cctv_monitored: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'TIVOLI GARDEN RESIDENCES BAY',
    latitude: 14.572198,
    longitude: 121.031239,
    sequence_order: 4,
    regular_fare: 14.00,
    student_fare: 11.20,
    elderly_fare: 11.20,
    disabled_fare: 11.20,
    is_esakay_hub: false,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Residential gate stop along Coronado Street with 24/7 security guards.',
    is_well_lit: true,
    cctv_monitored: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'MAYSILO CIRCLE / CITY HALL',
    latitude: 14.578322,
    longitude: 121.034201,
    sequence_order: 5,
    regular_fare: 15.75,
    student_fare: 12.60,
    elderly_fare: 12.60,
    disabled_fare: 12.60,
    is_esakay_hub: true,
    landmark_photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    landmark_desc: 'Maysilo Circle public terminal rotunda opposite Mandaluyong City Hall. Official e-Sakay dispatch station.',
    is_well_lit: true,
    cctv_monitored: true,
  }
];

// Active fleet with real plate numbers & capacity status (SO4 & SO5)
export const INITIAL_VEHICLES: VehicleData[] = [
  {
    id: 'veh-01',
    vehicle_id: 'veh-01',
    plate_number: 'NAE-4019',
    body_number: 'EJ-01',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    latitude: 14.561344,
    longitude: 121.029301,
    speed: 22,
    heading: 45,
    passenger_count: 14,
    max_capacity: 22,
    is_full: false,
    status: 'Maluwag',
  },
  {
    id: 'veh-02',
    vehicle_id: 'veh-02',
    plate_number: 'NBF-8932',
    body_number: 'EJ-04',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    latitude: 14.56405,
    longitude: 121.038606,
    speed: 18,
    heading: 50,
    passenger_count: 22,
    max_capacity: 22,
    is_full: true,
    status: 'Puno',
  },
  {
    id: 'veh-03',
    vehicle_id: 'veh-03',
    plate_number: 'NCB-1154',
    body_number: 'EJ-07',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    latitude: 14.55515,
    longitude: 121.034648,
    speed: 12,
    heading: 60,
    passenger_count: 18,
    max_capacity: 22,
    is_full: false,
    status: 'Sakto',
  },
];

const STORAGE_KEYS = {
  ROUTES: '@ejeephero_routes_cache_v4',
  TERMINALS: '@ejeephero_terminals_cache_v4',
  VEHICLES: '@ejeephero_vehicles_cache_v4',
  LAST_SYNC: '@ejeephero_last_sync_v4',
};

export class OfflineTransitService {
  private static instance: OfflineTransitService;
  private lastLatencyMs: number = 0;

  private constructor() {}

  public static getInstance(): OfflineTransitService {
    if (!OfflineTransitService.instance) {
      OfflineTransitService.instance = new OfflineTransitService();
    }
    return OfflineTransitService.instance;
  }

  /**
   * SO1: Cache-First Retrieval of Routes & Stops
   * Target: <2 seconds data retrieval latency (typically <50ms with local cache)
   */
  public async getTransitData(): Promise<{
    routes: RouteData[];
    terminals: TerminalData[];
    latencyMs: number;
    isFromCache: boolean;
  }> {
    const startTime = performance.now();

    try {
      // 1. Try reading from LocalStorage / AsyncStorage
      const [cachedRoutes, cachedTerminals] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ROUTES),
        AsyncStorage.getItem(STORAGE_KEYS.TERMINALS),
      ]);

      if (cachedRoutes && cachedTerminals) {
        const routes = JSON.parse(cachedRoutes) as RouteData[];
        const terminals = JSON.parse(cachedTerminals) as TerminalData[];
        const latency = Math.round(performance.now() - startTime);
        this.lastLatencyMs = latency;

        // Background update if network is available
        this.syncWithRemote().catch(() => {});

        return {
          routes: routes.length > 0 ? routes : [MAKATI_PRIMARY_ROUTE],
          terminals: terminals.length > 0 ? terminals : MAKATI_OFFICIAL_TERMINALS,
          latencyMs: latency,
          isFromCache: true,
        };
      }
    } catch (e) {
      console.warn('Cache read failed, falling back to static seed:', e);
    }

    // 2. Cache miss: Seed local storage with Makati static data
    await this.seedInitialCache();
    const latency = Math.round(performance.now() - startTime);
    this.lastLatencyMs = latency;

    return {
      routes: [MAKATI_PRIMARY_ROUTE],
      terminals: MAKATI_OFFICIAL_TERMINALS,
      latencyMs: latency,
      isFromCache: true,
    };
  }

  /**
   * Seed static dataset to AsyncStorage
   */
  public async seedInitialCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify([MAKATI_PRIMARY_ROUTE])),
        AsyncStorage.setItem(STORAGE_KEYS.TERMINALS, JSON.stringify(MAKATI_OFFICIAL_TERMINALS)),
        AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(INITIAL_VEHICLES)),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString()),
      ]);
    } catch (err) {
      console.error('Failed to seed initial transit cache:', err);
    }
  }

  /**
   * Sync with Supabase if online
   */
  public async syncWithRemote(): Promise<void> {
    try {
      const { data: routes } = await supabase.from('routes').select('*').limit(20);
      const { data: terminals } = await supabase.from('terminals').select('*, routes(*)').limit(50);

      if (routes && routes.length > 0) {
        await AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
      }
      if (terminals && terminals.length > 0) {
        await AsyncStorage.setItem(STORAGE_KEYS.TERMINALS, JSON.stringify(terminals));
      }
    } catch (err) {
      // Offline: Silently fail, keep cache
    }
  }

  /**
   * Get cached or simulated vehicles with capacity stats
   */
  public async getVehicles(): Promise<VehicleData[]> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
    return INITIAL_VEHICLES;
  }

  public getLastLatency(): number {
    return this.lastLatencyMs;
  }
}

export const offlineTransit = OfflineTransitService.getInstance();
