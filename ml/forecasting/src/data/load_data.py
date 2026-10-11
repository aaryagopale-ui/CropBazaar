import pandas as pd


def load_data(filepath: str) -> pd.DataFrame:
    """
    Load raw mandi data from a CSV file.
    """
    df = pd.read_csv(filepath)

    print(f"Loaded {len(df):,} rows")
    print(f"Columns: {list(df.columns)}")

    return df


if __name__ == "__main__":
    df = load_data("data/raw/mandi_data.csv")

    print("\nFirst 5 rows:")
    print(df.head())
