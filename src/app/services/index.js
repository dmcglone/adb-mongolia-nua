
import angular from 'angular';

import {appConfig} from '../../config';
import {SoumData} from './soum-data.service';
import {AimagData} from './aimag-data.service';
import {KhorooData} from './khoroo-data.service';

export const adbServicesModule = 'adb.services';

angular
  .module(adbServicesModule, [appConfig])
  .service('SoumData', SoumData)
  .service('AimagData', AimagData)
  .service('KhorooData', KhorooData);
