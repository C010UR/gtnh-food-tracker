# GTNH Food Tracker

The GTNH Food Tracker for GTNH 2.8.4

**This project is a remake of [GTNH_SpiceOfLifeHistoryExtract](https://github.com/PLASMAchicken/GTNH_SpiceOfLifeHistoryExtract/tree/master). The original version from [PLASMAchicken](https://github.com/PLASMAchicken) didn't work for me on the server and that is why i vibecoded this slop.**

**This is a completely vibecoded thing as i was lazy if you care about that.**

## Prerequisites

The following components are required to configure and run the tracker:

* **Node.js**: Ensure Node.js is installed on your system.
* **World Access**: Direct file access to the Minecraft `level.dat` file and the `playerdata` directory.
* **Google Account**: Required to host and execute the tracking spreadsheet.
* **Database File**: The `data.bin` item database file must be present in the project directory alongside the script.

## System Setup

### 1. Local Environment (Data Extractor)

1. Clone or download this repository to your local machine.
2. Open a terminal in the project directory and install the required dependencies:

   ```bash
   npm install
   ```

3. Create a configuration file named `options.json` in the root directory. This file defines the path to your world data and the specific players to process.

   *Example `options.json`:*

   ```json
   {
       "world": "~/minecraft-server/World",
       "whitelist": [
           {
               "uuid": "12345678-1234-1234-1234-123456789012",
               "name": "Player1"
           },
           {
               "uuid": "12345678-1234-1234-1234-123456789012",
               "name": "Player2"
           }
       ]
   }
   ```

   *(Note: The `~` character can be used to represent the current user's home directory in the `world` path).*

### 2. Google Spreadsheet (Data Visualization)

1. Open the base **[GTNH Food Tracker Spreadsheet](https://docs.google.com/spreadsheets/d/14bIekbw2_3LEKc0t8HNCKFUHX9fiLgJQ0P_J_W0HUT8/edit?usp=sharing)**.
2. Navigate to **File > Make a copy** to save a personal instance to your Google Drive.
3. In your copied spreadsheet, navigate to **Extensions > Apps Script**.
4. Create the following two files in the Apps Script editor using the code provided in the `sheet-scripts` directory:
   * `AutoImport.gs`
   * `ImportDialog.html`
5. Save the project and return to the main spreadsheet view.
6. **Create the Import Interface:**
   * Navigate to **Insert > Drawing**.
   * Create a shape to serve as a button (e.g., a rectangle with the text "Import JSON").
   * Save and close the drawing interface.
   * Click the newly created button in your sheet, select the three vertical dots (⋮) in the top right corner, and click **Assign script**.
   * Enter the function name: `checkFoodItems` and click OK.

## Usage

### Step 1: Extract the Data

Execute the extraction script from your terminal:

```bash
node sol_extract.mjs
```

The script will generate a JSON file for each player defined in your `options.json` whitelist from the world folder specified in your configuration.

### Step 2: Retrieve the Output

Navigate to the generated `output/` director, copy the contents of generate JSON files.

### Step 3: Import into the Spreadsheet

1. Open your Google Spreadsheet.
2. Click the assigned import button on the sheet. *(Note: Upon first execution, Google will prompt you to authorize the script. Follow the on-screen instructions to grant necessary permissions).*
3. The import dialog interface will appear. Paste your copied JSON into the text area.
4. Click **Import**.

The script will automatically parse the input, cross-reference it against the `All` sheet, and update the checkboxes. It will also alert you to any missing items or hunger value discrepancies.
